'use server'

import { db } from '@/database'

export const getUserIdByClerkId = async (clerkId: string) => {
    const user = await db.selectFrom('user').select(['id', 'clerkId']).where('clerkId', '=', clerkId).executeTakeFirst()

    return user?.id || null
}

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .innerJoin('user', 'userPublicKey.userId', 'user.id')
        .select(['userPublicKey.publicKey as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}

export const findOrCreateSiUserId = async (clerkId: string, name: string) => {
    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkId)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                name,
                clerkId,
                isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}
