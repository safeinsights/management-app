'use server'

import { db } from '@/database'
import { currentUser } from '@clerk/nextjs/server'
import { anonAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'

export const onUserSignInAction = anonAction(async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    const siUserId = await findOrCreateSiUserId(clerkUser.id, {
        firstName: clerkUser.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
        lastName: clerkUser.lastName,
        email: clerkUser.primaryEmailAddress?.emailAddress,
    })

    onUserLogIn({ userId: siUserId })
})

export const onUserResetPWAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()
    onUserResetPW(userId)
})

export const updateUserRoleAction = orgAdminAction(
    async ({ orgSlug, userId, ...update }) => {
        const { id, ...before } = await db
            .selectFrom('orgUser')
            .select(['orgUser.id', 'isResearcher', 'isReviewer', 'isAdmin'])
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .where('org.slug', '=', orgSlug as string)
            .where('orgUser.userId', '=', userId)
            .executeTakeFirstOrThrow()

        await db.updateTable('orgUser').set(update).where('id', '=', id).executeTakeFirstOrThrow()

        onUserRoleUpdate({ userId, before, after: update })
    },
    z.object({
        orgSlug: z.string(),
        userId: z.string(),
        isAdmin: z.boolean(),
        isResearcher: z.boolean(),
        isReviewer: z.boolean(),
    }),
)
