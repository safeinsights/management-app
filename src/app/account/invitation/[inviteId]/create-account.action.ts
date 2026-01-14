'use server'

import { Action, ActionFailure, z } from '@/server/actions/action'
import { updateClerkUserMetadata } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { clerkClient } from '@clerk/nextjs/server'

export const onPendingUserLoginAction = new Action('onPendingUserLoginAction')
    .params(z.object({ inviteId: z.string() }))
    .requireAbilityTo('claim', 'PendingUser')
    .handler(async ({ params: { inviteId }, session, db }) => {
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: session.user.id })
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow()
    })

export const getOrgInfoForInviteAction = new Action('getOrgInfoForInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db }) {
        return await db
            .selectFrom('org')
            .innerJoin('pendingUser', 'pendingUser.orgId', 'org.id')
            .innerJoin('user as invitingUser', 'invitingUser.id', 'pendingUser.invitedByUserId')
            .select([
                'org.id',
                'org.name',
                'org.slug',
                'pendingUser.isAdmin',
                'pendingUser.email',
                'invitingUser.firstName as invitingUserFirstName',
                'invitingUser.lastName as invitingUserLastName',
            ])
            .where('pendingUser.id', '=', inviteId)
            .executeTakeFirstOrThrow()
    })

export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db }) {
        await db.deleteFrom('pendingUser').where('id', '=', inviteId).executeTakeFirstOrThrow()
    })

export const onJoinTeamAccountAction = new Action('onJoinTeamAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
            loggedInEmail: z.string().optional(), // provide if merging team invite to existing user account
        }),
    )

    .handler(async function ({ params: { inviteId, loggedInEmail }, db }) {
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        let user = await db
            .selectFrom('user')
            .select(['id', 'email', 'clerkId'])
            .where('email', '=', loggedInEmail ? loggedInEmail : invite.email)
            .executeTakeFirst()

        // If user not found by email, check if email belongs to any existing Clerk user (handles merged emails)
        if (!user) {
            const clerk = await clerkClient()
            const clerkUsers = await clerk.users.getUserList({ emailAddress: [invite.email] })

            if (clerkUsers.data.length > 0) {
                // Check if this Clerk user has a corresponding user in the DB
                user = await db
                    .selectFrom('user')
                    .select(['id', 'email', 'clerkId'])
                    .where('clerkId', '=', clerkUsers.data[0].id)
                    .executeTakeFirst()
            }
        }

        if (!user) {
            throw new ActionFailure({ user: 'does not exist' })
        }

        const siUser = await db.transaction().execute(async (trx) => {
            const orgUser = await trx
                .selectFrom('orgUser')
                .where('orgId', '=', invite.orgId)
                .where('userId', '=', user.id)
                .select(['id'])
                .executeTakeFirst()

            // If the user is already a member, we simply return the user so the
            // rest of the handler can continue (adding the invite email to the
            // account, marking the invite as claimed, etc.).
            if (orgUser) {
                return user
            }

            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            return user
        })

        if (loggedInEmail) {
            // add the invite email to the existing user's email addresses in clerk
            const clerk = await clerkClient()

            const emailAddress = await clerk.emailAddresses.createEmailAddress({
                userId: user.clerkId,
                emailAddress: invite.email,
            })

            // auto-verify email (the user has already followed the email invite link)
            await clerk.emailAddresses.updateEmailAddress(emailAddress.id, { verified: true })
        }

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        // mark invite as claimed by this user so it no longer shows in pending lists
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: siUser.id })
            .where('id', '=', inviteId)
            .where('claimedByUserId', 'is', null)
            .executeTakeFirst()

        return siUser
    })

export const onCreateAccountAction = new Action('onCreateAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
            form: z.object({
                firstName: z.string(),
                lastName: z.string(),
                password: z.string(),
                confirmPassword: z.string(),
            }),
        }),
    )

    .handler(async function ({ params: { inviteId, form }, db }) {
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const clerk = await clerkClient()

        let clerkId = ''

        const users = await clerk.users.getUserList({ emailAddress: [invite.email] })
        if (users.data.length) {
            clerkId = users.data[0].id
        } else {
            const createdByCIJobId = process.env.GITHUB_JOB
            const privateMetadata = createdByCIJobId ? { createdByCIJobId } : undefined
            const clerkUser = await clerk.users.createUser({
                firstName: form.firstName,
                lastName: form.lastName,
                emailAddress: [invite.email],
                password: form.password,
                privateMetadata,
            })
            clerkId = clerkUser.id

            const primaryEmail = clerkUser.emailAddresses.find((e) => e.emailAddress === invite.email)
            if (primaryEmail) {
                await clerk.emailAddresses.updateEmailAddress(primaryEmail.id, { verified: true })
            }
        }

        const siUser = await db.transaction().execute(async (trx) => {
            const existing = await trx
                .selectFrom('user')
                .select(['id', 'clerkId'])
                .where('email', '=', invite.email)
                .executeTakeFirst()

            let user: { id: string }

            if (existing) {
                if (existing.clerkId === clerkId) {
                    user = existing
                } else {
                    throw new ActionFailure({ user: 'already has account' })
                }
            } else {
                user = await trx
                    .insertInto('user')
                    .values({
                        clerkId,
                        firstName: form.firstName,
                        lastName: form.lastName,
                        email: invite.email,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow()
            }

            const orgUser = await trx
                .selectFrom('orgUser')
                .where('orgId', '=', invite.orgId)
                .where('userId', '=', user.id)
                .select(['id'])
                .executeTakeFirst()

            if (orgUser) {
                throw new ActionFailure({ team: 'already a member' })
            }

            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            return user
        })

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
