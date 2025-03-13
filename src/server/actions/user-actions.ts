'use server'

import { db } from '@/database'

export const getUserIdByClerkId = async (clerkId: string) => {
    const user = await db.selectFrom('user').select(['id', 'clerkId']).where('clerkId', '=', clerkId).executeTakeFirst()

    return user?.id || null
}

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('memberUserPublicKey')
        .innerJoin('user', 'memberUserPublicKey.userId', 'user.id')
        .select(['memberUserPublicKey.value as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}
