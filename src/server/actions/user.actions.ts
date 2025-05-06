'use server'

import { db } from '@/database'
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { anonAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { onUserLogIn, onUserResetPW } from '../events'

export const onUserSignInAction = anonAction(async () => {
    const user = await currentUser()

    if (!user) throw new Error('User not authenticated')

    const siUserId = await findOrCreateSiUserId(user.id, {
        firstName: user.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
        lastName: user.lastName,
        email: user.primaryEmailAddress?.emailAddress,
    })
    const client = await clerkClient()

    const metadata = await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
            userId: siUserId,
        },
    })

    onUserLogIn(siUserId)

    return metadata
})

export const onUserResetPWAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()
    onUserResetPW(userId)
})

export const updateUserRoleAction = orgAdminAction(
    async ({ orgSlug, userId, isAdmin, isResearcher, isReviewer }) => {
        return db
            .updateTable('orgUser')
            .set({
                isAdmin,
                isReviewer,
                isResearcher,
            })
            .from('org')
            .whereRef('org.id', '=', 'orgUser.orgId')
            .where('org.slug', '=', orgSlug as string)
            .where('userId', '=', userId)
            .returningAll('orgUser')
            .executeTakeFirstOrThrow()
    },
    z.object({
        orgSlug: z.string(),
        userId: z.string(),
        isAdmin: z.boolean(),
        isResearcher: z.boolean(),
        isReviewer: z.boolean(),
    }),
)
