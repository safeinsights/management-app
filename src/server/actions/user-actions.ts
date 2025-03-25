'use server'

import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { userAction } from './wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'

export const onUserSignInAction = userAction(async () => {
    const user = await currentUser()
    if (!user) throw new Error('User not authenticated')

    const siUserId = await findOrCreateSiUserId(user.id, {
        firstName: user.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
        lastName: user.lastName,
        email: user.primaryEmailAddress?.emailAddress,
    })
    const client = await clerkClient()
    await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
            userId: siUserId,
        },
    })
})
