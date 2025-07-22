'use server'

import { db } from '@/database'
import { calculateUserPublicMetadata } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { clerkClient } from '@clerk/nextjs/server'
import { Action, z, ActionFailure } from '@/server/actions/action'
import { ENVIRONMENT_ID } from '@/server/config'

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
            let user = await trx.selectFrom('user').select(['id']).where('email', '=', invite.email).executeTakeFirst()
            if (!user) {
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

            if (!orgUser) {
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
            }
            return user
        })

        const metadata = await calculateUserPublicMetadata(siUser.id)
        await clerk.users.updateUserMetadata(clerkId, {
            publicMetadata: {
                [`${ENVIRONMENT_ID}`]: metadata,
            },
        })

        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
