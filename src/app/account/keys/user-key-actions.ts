'use server'

import { db } from '@/database'
import { getUserIdByClerkId } from '@/server/actions/user-actions'

export const testQuery = async () => {
    return await db.selectFrom('user').selectAll().execute()
    // return await db.selectFrom('memberUserPublicKey').selectAll().execute()
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
        .onConflict((oc) =>
            oc.column('userId').doUpdateSet({
                value: publicKey,
                fingerprint: fingerprint,
            }),
        )
        .execute()
}
