'use server'

import { db } from '@/database'
import { z } from 'zod'
import { currentUser, clerkClient } from '@clerk/nextjs/server'
import { anonAction, userAction } from './wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'



export const onUserSignInAction = anonAction(async () => {
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

export const getMemberIdFromIdentifierAction = userAction(async (identifier) => {
    return await db.selectFrom('member').select('id').where('identifier', '=', identifier).executeTakeFirst()
}, z.string())

export const getIdentifierFromMemberIdAction = userAction(async (memberId) => {
    const result = await db.selectFrom('member').select('identifier').where('id', '=', memberId).executeTakeFirst()
    return result.identifier
})