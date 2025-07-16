'use server'

import { db } from '@/database'
import { getReviewerPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Action, z, ActionFailure } from './action'

export const getReviewerPublicKeyAction = new Action('getReviewerPublicKeyAction')
    .requireAbilityTo('read', 'ReviewerKey', (args, { session }) => ({ userId: session.user.id }))
    .handler(async (args, { session }) => {
        return await getReviewerPublicKey(session.user.id)
    })

const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
    fingerprint: z.string(),
})

export const setReviewerPublicKeyAction = new Action('setReviewerPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'ReviewerKey', (args, { session }) => ({ userId: session.user.id }))
    .handler(async ({ publicKey, fingerprint }, { session }) => {
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
    .requireAbilityTo('update', 'ReviewerKey', (args, { session }) => ({ userId: session.user.id }))
    .handler(async ({ publicKey, fingerprint }, { session }) => {
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
