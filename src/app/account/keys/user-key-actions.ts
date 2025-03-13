'use server'

import { db } from '@/database'
import { getUserIdByClerkId } from '@/server/actions/user-actions'

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('memberUserPublicKey')
        .innerJoin('user', 'memberUserPublicKey.userId', 'user.id')
        .select(['memberUserPublicKey.value as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}

export const setMemberUserPublicKey = async (clerkId: string, publicKey: string, fingerprint: string) => {
    const userId = await getUserIdByClerkId(clerkId)

    if (!userId) {
        throw new Error(`User for clerk id ${clerkId} doesn't exist!`)
    }

    await db
        .insertInto('memberUserPublicKey')
        .values({
            userId: userId,
            value: publicKey,
            fingerprint: fingerprint,
        })
        .execute()
}
