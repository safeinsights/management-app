'use server'

import { getReviewerPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Action, ActionFailure, z } from './action'

export const getReviewerPublicKeyAction = new Action('getReviewerPublicKeyAction')
    .requireAbilityTo('view', 'ReviewerKey')
    .handler(async ({ session }) => {
        return await getReviewerPublicKey(session.user.id)
    })

// Helper that returns a boolean instead of the full row so we can safely
// pass the value to client components without serialization issues.
export const reviewerKeyExistsAction = new Action('reviewerKeyExistsAction')
    .requireAbilityTo('view', 'ReviewerKey')
    .handler(async ({ session }) => {
        const key = await getReviewerPublicKey(session.user.id)
        return Boolean(key)
    })

const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
    fingerprint: z.string(),
})

export const setReviewerPublicKeyAction = new Action('setReviewerPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'ReviewerKey')
    .handler(async ({ params: { publicKey, fingerprint }, session, db }) => {
        const userId = session.user.id

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
    })

export const updateReviewerPublicKeyAction = new Action('updateReviewerPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'ReviewerKey')
    .handler(async ({ params: { publicKey, fingerprint }, session, db }) => {
        const userId = session.user.id

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
    })
