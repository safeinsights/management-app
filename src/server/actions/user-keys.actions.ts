'use server'

import { getOrgInfoForUserId, getUserPublicKey } from '@/server/db/queries'
import { onUserPublicKeyCreated, onUserPublicKeyUpdated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Routes } from '@/lib/routes'
import { fingerprintKeyData } from 'si-encryption/util'
import { assertValidPublicKey, InvalidPublicKeyError } from '@/lib/public-key'
import { Action, ActionFailure, z } from './action'

function revalidateKeyPages(): void {
    revalidatePath(Routes.accountKeys)
    revalidatePath(Routes.userKey)
}

export const getUserPublicKeyAction = new Action('getUserPublicKeyAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session }) => {
        return await getUserPublicKey(session.user.id)
    })

export const userKeyExistsAction = new Action('userKeyExistsAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session }) => {
        const key = await getUserPublicKey(session.user.id)
        return Boolean(key)
    })

// Anything ambiguous returns "My dashboard" rather than guessing which org invited the account.
export const getKeyPageStateAction = new Action('getKeyPageStateAction')
    .requireAbilityTo('view', 'UserKey')
    .handler(async ({ session }) => {
        const hasKey = Boolean(await getUserPublicKey(session.user.id))

        if (hasKey) return { hasKey, firstKeyRedirect: Routes.dashboard }

        // Not session.orgs: that Clerk metadata is stale right after a signup or invite accept.
        const orgs = await getOrgInfoForUserId(session.user.id)

        if (orgs.length !== 1) return { hasKey, firstKeyRedirect: Routes.dashboard }

        return { hasKey, firstKeyRedirect: Routes.orgDashboard({ orgSlug: orgs[0].slug }) }
    })

// No `fingerprint` field: derived server-side, since a mismatched one would make senders wrap to
// a key the owner cannot unwrap.
const setOrgUserPublicKeySchema = z.object({
    publicKey: z.instanceof(ArrayBuffer),
})

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

        // Rotation orphans outputs wrapped to the old key; the loss is confirmed in the reset modal.
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
