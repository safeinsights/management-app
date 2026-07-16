'use server'

import { getUserPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Routes } from '@/lib/routes'
import { fingerprintKeyData } from 'si-encryption/util'
import { Action, ActionFailure, z } from './action'

// Pages that render the user's key state — bust both after a key write so presence/fingerprint
// don't read stale.
function revalidateKeyPages(): void {
    revalidatePath(Routes.accountKeys)
    revalidatePath(Routes.userKey)
}

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

// No `fingerprint` field: it's derived server-side from `publicKey` (deterministic SHA-256 over the
// SPKI bytes). A client-supplied fingerprint that didn't match would make every sender wrap to a
// key the owner can't unwrap — silent, permanent decrypt failure with no recourse until renewal.
const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
})

// Reject keys that aren't importable RSA SPKI DER. A single malformed key in an org breaks
// encryption for every sender wrapping to that org's recipients (TOA results upload, the
// reviewer's approve/re-wrap), so catch it at storage time. Import params mirror si-encryption's
// wrapAesKey.
async function assertValidPublicKey(publicKey: ArrayBuffer): Promise<void> {
    try {
        await crypto.subtle.importKey('spki', publicKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
    } catch {
        throw new ActionFailure({ publicKey: 'is not a valid RSA public key' })
    }
}

export const setUserPublicKeyAction = new Action('setUserPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'UserKey')
    .handler(async ({ params: { publicKey }, session, db }) => {
        const userId = session.user.id

        await assertValidPublicKey(publicKey)
        const fingerprint = await fingerprintKeyData(publicKey)

        await db
            .insertInto('userPublicKey')
            .values({
                userId,
                publicKey: Buffer.from(publicKey),
                fingerprint,
            })
            .executeTakeFirstOrThrow(() => new ActionFailure({ message: 'Failed to set user public key' }))

        onUserPublicKeyCreated({ userId })
        revalidateKeyPages()
    })

export const updateUserPublicKeyAction = new Action('updateUserPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'UserKey')
    .handler(async ({ params: { publicKey }, session, db }) => {
        const userId = session.user.id

        await assertValidPublicKey(publicKey)
        const fingerprint = await fingerprintKeyData(publicKey)

        // Rotation swaps the fingerprint, orphaning outputs wrapped to the old key; the loss is confirmed in the reset modal.
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
        revalidateKeyPages()
    })
