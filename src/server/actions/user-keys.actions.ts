'use server'

import { db } from '@/database'
import { z, userAction, getUserIdFromActionContext, ActionFailure } from './wrappers'
import { getReviewerPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'

export const getReviewerPublicKeyAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()

    return await getReviewerPublicKey(userId)
})

const setOrgUserPublicKeySchema = z.object({ publicKey: z.instanceof(ArrayBuffer), fingerprint: z.string() })

export const setReviewerPublicKeyAction = userAction(async ({ publicKey, fingerprint }) => {
    const userId = await getUserIdFromActionContext()

    if (!publicKey.byteLength) {
        throw new Error('Invalid public key format')
    }

    await db
        .insertInto('userPublicKey')
        .values({
            userId,
            publicKey: Buffer.from(publicKey),
            fingerprint,
        })
        .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to set reviewer public key' }))

    onUserPublicKeyCreated({ userId })
    revalidatePath('/reviewer')
}, setOrgUserPublicKeySchema)

export const updateReviewerPublicKeyAction = userAction(async ({ publicKey, fingerprint }) => {
    const userId = await getUserIdFromActionContext()

    await db
        .updateTable('userPublicKey')
        .set({
            publicKey: Buffer.from(publicKey),
            fingerprint,
            updatedAt: new Date(),
        })
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to update reviewer public key.' }))

    onUserPublicKeyUpdated({ userId })
}, setOrgUserPublicKeySchema)
