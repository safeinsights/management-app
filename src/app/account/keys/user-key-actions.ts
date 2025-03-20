'use server'

import { db } from '@/database'
import { siUser } from '@/server/queries'

export const getMemberUserPublicKey = async (clerkId: string) => {
    const result = await db
        .selectFrom('userPublicKey')
        .innerJoin('user', 'userPublicKey.userId', 'user.id')
        .select(['userPublicKey.publicKey as memberUserPublicKey'])
        .where('user.clerkId', '=', clerkId)
        .executeTakeFirst()

    return result?.memberUserPublicKey
}

export const setMemberUserPublicKey = async (publicKey: ArrayBuffer, fingerprint: string) => {
    const user = await siUser()

    await db
        .insertInto('userPublicKey')
        .values({
            userId: user.id,
            publicKey: Buffer.from(publicKey),
            fingerprint: fingerprint,
        })
        .execute()
}
