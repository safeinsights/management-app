'use server'

import { db } from '@/database'
import { z, userAction, getUserIdFromActionContext } from './wrappers'
import { getReviewerPublicKey } from '@/server/db/queries'
import { ensureUserIsMemberOfOrg } from '../mutations'

export const getReviewerFingerprintAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()

    const result = await db
        .selectFrom('userPublicKey')
        .select(['userPublicKey.fingerprint'])
        .where('userPublicKey.userId', '=', userId)
        .executeTakeFirst()

    return result?.fingerprint
})

export const getReviewerPublicKeyAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()

    return await getReviewerPublicKey(userId)
})

const setOrgUserPublicKeySchema = z.object({ publicKey: z.instanceof(ArrayBuffer), fingerprint: z.string() })

export const setReviewerPublicKeyAction = userAction(async ({ publicKey, fingerprint }) => {
    const userId = await getUserIdFromActionContext()

    // during MVP, we have several users who were set up in clerk without invites
    // those accounts are not associated with any organization
    await ensureUserIsMemberOfOrg()

    await db
        .insertInto('userPublicKey')
        .values({
            userId,
            publicKey: Buffer.from(publicKey),
            fingerprint,
        })
        .execute()
}, setOrgUserPublicKeySchema)

// Utility function to check if a reviewer has a public key
export async function hasReviewerPublicKey(userId: string): Promise<boolean> {
    const publicKey = await getReviewerPublicKey(userId)
    return Boolean(publicKey)
}
