'use server'

import { db } from '@/database'
import { ActionFailure, Action, z } from './action'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { syncCurrentClerkUser } from '../clerk'
import { loadSession } from '../session'
import { getReviewerPublicKey } from '../db/queries'

export const onUserSignInAction = new Action('onUserSignInAction')
    .requireAbilityTo('update', 'User')
    .handler(async () => {
        const user = await syncCurrentClerkUser()

        onUserLogIn({ userId: user.id })

        const session = await loadSession()
        if (!session) throw new ActionFailure({ user: `is not logged in when after signing in?` })

        if (session.team.isReviewer) {
            const publicKey = await getReviewerPublicKey(user.id)
            if (!publicKey) {
                return { redirectToReviewerKey: true }
            }
        }
    })

export const onUserResetPWAction = new Action('onUserResetPWAction')
    .requireAbilityTo('update', 'User')
    .handler(async (_, { session }) => {
        onUserResetPW(session.user.id)
    })

export const updateUserRoleAction = new Action('updateUserRoleAction')
    .params(
        z.object({
            orgSlug: z.string(),
            userId: z.string(),
            isAdmin: z.boolean(),
            isResearcher: z.boolean(),
            isReviewer: z.boolean(),
        }),
    )
    .requireAbilityTo('update', 'User')
    .handler(async ({ orgSlug, userId, ...update }) => {
        const { id, ...before } = await db
            .selectFrom('orgUser')
            .select(['orgUser.id', 'isResearcher', 'isReviewer', 'isAdmin'])
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .where('org.slug', '=', orgSlug as string)
            .where('orgUser.userId', '=', userId)
            .executeTakeFirstOrThrow()

        await db.updateTable('orgUser').set(update).where('id', '=', id).executeTakeFirstOrThrow()

        onUserRoleUpdate({ userId, before, after: update })
    })
