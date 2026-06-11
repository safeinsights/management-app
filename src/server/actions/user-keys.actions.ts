'use server'

import { getUserPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Action, ActionFailure, z } from './action'

export const getUserPublicKeyAction = new Action('getUserPublicKeyAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session }) => {
        return await getUserPublicKey(session.user.id)
    })

// Helper that returns a boolean instead of the full row so we can safely
// pass the value to client components without serialization issues.
export const userKeyExistsAction = new Action('userKeyExistsAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session }) => {
        const key = await getUserPublicKey(session.user.id)
        return Boolean(key)
    })

const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
    fingerprint: z.string(),
})

export const setUserPublicKeyAction = new Action('setUserPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'UserKey')
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
            .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to set user public key' }))

        onUserPublicKeyCreated({ userId })
        revalidatePath('/reviewer')
    })

export const updateUserPublicKeyAction = new Action('updateUserPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'UserKey')
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
            .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to update user public key.' }))

        onUserPublicKeyUpdated({ userId })
    })
