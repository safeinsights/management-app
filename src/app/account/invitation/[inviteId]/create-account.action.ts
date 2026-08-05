'use server'

import { Action, ActionFailure, z } from '@/server/actions/action'
import { updateClerkUserMetadata } from '@/server/clerk'
import { getUserPublicKey } from '@/server/db/queries'
import { onUserAcceptInvite } from '@/server/events'
import { extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
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
            .leftJoin('user as invitingUser', 'invitingUser.id', 'pendingUser.invitedByUserId')
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

// Two legitimate callers with different rights: an org admin revoking an invite, and the invitee
// declining it. The invitee may not be a member of the org at all, so no single ability rule covers
// both — authorization is an explicit either/or below. Previously this action had no check of any
// kind, letting any caller delete any invite by id.
export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db, session }) {
        // This action has no requireAbilityTo, so an unauthenticated caller still reaches the
        // handler with a null session; both branches below require an identity.
        if (!session) {
            throw new ActionFailure({ permission_denied: 'cannot revoke this invite' })
        }

        const invite = await db
            .selectFrom('pendingUser')
            .select(['id', 'orgId', 'email'])
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const isOrgAdmin = session.ability.can('revoke', toRecord('PendingUser', { orgId: invite.orgId }))

        // The invitee is identified by email rather than claimedByUserId, which is only set on the
        // signup path and stays null when an existing user opens the invite (join-team page).
        // Checked against all Clerk addresses so merged/secondary emails match, as the UI does.
        const isInvitee = await callerOwnsEmail(session.user.clerkUserId, invite.email)

        if (!isOrgAdmin && !isInvitee) {
            throw new ActionFailure({ permission_denied: 'cannot revoke this invite' })
        }

        await db.deleteFrom('pendingUser').where('id', '=', invite.id).executeTakeFirstOrThrow()
    })

const callerOwnsEmail = async (clerkUserId: string, email: string) => {
    const clerk = await clerkClient()
    const clerkUser = await clerk.users.getUser(clerkUserId)
    return clerkUser.emailAddresses.some((ea) => ea.emailAddress.toLowerCase() === email.toLowerCase())
}

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

        // Checked here too because the client RequireUserKey guard reads Clerk useUser() metadata,
        // which can be stale right after this server-side update.
        const needsUserKey = !(await getUserPublicKey(siUser.id))

        return { ...siUser, needsUserKey }
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
            let clerkUser
            try {
                clerkUser = await clerk.users.createUser({
                    firstName: form.firstName,
                    lastName: form.lastName,
                    emailAddress: [invite.email],
                    password: form.password,
                    privateMetadata,
                })
            } catch (error) {
                // Clerk rejects weak/compromised passwords (and other invalid input) with a 422.
                // Surface the human-readable reason inline instead of the opaque "Unprocessable
                // Entity" toast. The signup form renders the `form` key as a dedicated alert and
                // uses `code` to pick an appropriate title (e.g. "Compromised Password").
                if (isClerkApiError(error)) {
                    const { code, message } = extractClerkCodeAndMessage(error)
                    throw new ActionFailure({ form: message, code })
                }
                throw error
            }
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
