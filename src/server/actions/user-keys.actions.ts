'use server'

import { db } from '@/database'
import { z, userAction, getUserIdFromActionContext, ActionFailure } from './wrappers'
import { getReviewerPublicKey } from '@/server/db/queries'

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

    await db
        .insertInto('userPublicKey')
        .values({
            userId,
            publicKey: Buffer.from(publicKey),
            fingerprint,
        })
        .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to set reviewer public key' }))
}, setOrgUserPublicKeySchema)
