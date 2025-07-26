'use server'

import { ActionFailure, Action, z } from './action'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { syncCurrentClerkUser, updateClerkUserMetadata } from '../clerk'
import { sessionFromClerk } from '@/server/clerk'
import { getReviewerPublicKey } from '../db/queries'

export const onUserSignInAction = new Action('onUserSignInAction').handler(async () => {
    const user = await syncCurrentClerkUser()
    await updateClerkUserMetadata(user.id)
    onUserLogIn({ userId: user.id })

    const session = await sessionFromClerk()
    if (!session) throw new ActionFailure({ user: `is not logged in when after signing in?` })

    if (session.team.isReviewer) {
        const publicKey = await getReviewerPublicKey(user.id)
        if (!publicKey) {
            return { redirectToReviewerKey: true }
        }
    }
})

export const syncUserMetadataAction = new Action('syncUserMetadataAction').handler(async () => {
    const user = await syncCurrentClerkUser()
    const metadata = await updateClerkUserMetadata(user.id)
    return metadata
})

export const onUserResetPWAction = new Action('onUserResetPWAction')
    .middleware(async (_, { session }) => {
        if (!session) throw new ActionFailure({ user: 'Unauthorized' })
        return { id: session.user.id, orgId: session.team.id }
    })
    .requireAbilityTo('update', 'User')
    .handler(async ({ session }) => {
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
    .middleware(async ({ userId, orgSlug }, { db }) => {
        const orgUser = await db
            .selectFrom('orgUser')
            .select(['orgUser.id', 'orgId', 'isResearcher', 'isReviewer', 'isAdmin'])
            .where('orgUser.userId', '=', userId)
            .innerJoin('org', (join) => join.on('org.slug', '=', orgSlug).onRef('org.id', '=', 'orgUser.orgId'))
            .executeTakeFirstOrThrow()
        return { orgUser, orgId: orgUser.orgId, id: userId }
    })
    .requireAbilityTo('update', 'User')
    .handler(async ({ params: { orgSlug, userId, ...update }, db, orgUser }) => {
        await db.updateTable('orgUser').set(update).where('id', '=', orgUser.id).executeTakeFirstOrThrow()
        onUserRoleUpdate({ userId, before: orgUser, after: update })
    })
