'use server'

import { getUserPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Routes } from '@/lib/routes'
import { fingerprintKeyData } from 'si-encryption/util'
import { assertValidPublicKey, InvalidPublicKeyError } from '@/lib/public-key'
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

// Landing for the key page when no destination was carried in — the RequireUserKey guard pushes a
// bare url, so the page has to answer this itself. NOT a claim about which org invited the account:
// a single-org account simply has one dashboard it could land on, so the answer cannot be wrong even
// though it proves nothing about provenance. Anything ambiguous (no orgs, or several) returns "My
// dashboard" rather than guessing.
export const getFirstKeyRedirectAction = new Action('getFirstKeyRedirectAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session, db }) => {
        const orgs = await db
            .selectFrom('orgUser')
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .select('org.slug')
            .where('orgUser.userId', '=', session.user.id)
            .limit(2)
            .execute()

        if (orgs.length !== 1) return Routes.dashboard

        return Routes.orgDashboard({ orgSlug: orgs[0].slug })
    })

// No `fingerprint` field: it's derived server-side from `publicKey` (deterministic SHA-256 over the
// SPKI bytes). A client-supplied fingerprint that didn't match would make every sender wrap to a
// key the owner can't unwrap — silent, permanent decrypt failure with no recourse until renewal.
const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
})

// Surface the shared SPKI validation as a field error so the key form can render it.
async function validatePublicKeyParam(publicKey: ArrayBuffer): Promise<void> {
    try {
        await assertValidPublicKey(publicKey)
    } catch (error) {
        if (error instanceof InvalidPublicKeyError) {
            throw new ActionFailure({ publicKey: error.message })
        }
        throw error
    }
}

export const setUserPublicKeyAction = new Action('setUserPublicKeyAction')
    .params(setOrgUserPublicKeySchema)
    .requireAbilityTo('update', 'UserKey')
    .handler(async ({ params: { publicKey }, session, db }) => {
        const userId = session.user.id

        await validatePublicKeyParam(publicKey)
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

        await validatePublicKeyParam(publicKey)
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
