'use server'

import { db } from '@/database'
import { siUser } from '@/server/queries'

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('memberUserPublicKey')
        .innerJoin('user', 'memberUserPublicKey.userId', 'user.id')
        .select(['memberUserPublicKey.value as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}

export const getMemberUserFingerprint = async (clerkId: string | null) => {
    const result = await db
        .selectFrom('memberUserPublicKey')
        .innerJoin('user', 'memberUserPublicKey.userId', 'user.id')
        .select(['memberUserPublicKey.fingerprint'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()
    return result?.fingerprint || null
}

export const setMemberUserPublicKey = async (clerkId: string, publicKey: string, fingerprint: string) => {
    const user = await siUser()

    await db
        .insertInto('memberUserPublicKey')
        .values({
            userId: user.id,
            value: publicKey,
            fingerprint: fingerprint,
        })
        .execute()
}
