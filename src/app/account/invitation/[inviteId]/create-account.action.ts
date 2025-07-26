'use server'

import { db } from '@/database'
import { onUserAcceptInvite } from '@/server/events'
import { clerkClient } from '@clerk/nextjs/server'
import { Action, z, ActionFailure } from '@/server/actions/action'

export const onPendingUserLoginAction = new Action('onPendingUserLoginAction')
    .params(z.object({ inviteId: z.string() }))
    .requireAbilityTo('claim', 'PendingUser')
    .handler(async ({ inviteId }, { session }) => {
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
    .handler(async function ({ inviteId }) {
        return await db
            .selectFrom('org')
            .innerJoin('pendingUser', 'pendingUser.orgId', 'org.id')
            .select(['org.id', 'org.name', 'org.slug', 'pendingUser.email'])
            .where('pendingUser.id', '=', inviteId)
            .executeTakeFirstOrThrow()
    })

export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ inviteId }) {
        await db.deleteFrom('pendingUser').where('id', '=', inviteId).executeTakeFirstOrThrow()
    })

export const onJoinTeamAccountAction = new Action('onJoinTeamAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )

    .handler(async function ({ inviteId }) {
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const user = await db.selectFrom('user').select(['id']).where('email', '=', invite.email).executeTakeFirst()
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

            if (orgUser) {
                throw new ActionFailure({ team: 'already a member' })
            }

            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isResearcher: invite.isResearcher,
                    isReviewer: invite.isReviewer,
                    isAdmin: false,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            return user
        })

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

    .handler(async function ({ inviteId, form }) {
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
            const clerkUser = await clerk.users.createUser({
                firstName: form.firstName,
                lastName: form.lastName,
                emailAddress: [invite.email],
                password: form.password,
            })
            clerkId = clerkUser.id
        }

        const siUser = await db.transaction().execute(async (trx) => {
            const existing = await trx
                .selectFrom('user')
                .select(['id'])
                .where('email', '=', invite.email)
                .executeTakeFirst()

            if (existing) {
                throw new ActionFailure({ user: 'already has account' })
            }

            const user = await trx
                .insertInto('user')
                .values({
                    clerkId,
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: invite.email,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

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
                    isResearcher: invite.isResearcher,
                    isReviewer: invite.isReviewer,
                    isAdmin: false,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            return user
        })

        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
