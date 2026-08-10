import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult, faker, insertTestOrg, readTestSupportFile } from '@/tests/unit.helpers'
import {
    getFirstKeyRedirectAction,
    getUserPublicKeyAction,
    setUserPublicKeyAction,
    updateUserPublicKeyAction,
} from './user-keys.actions'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'

async function validTestKey() {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

vi.mock('@/server/events', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/events')>()),
    onUserPublicKeyCreated: vi.fn(),
    onUserPublicKeyUpdated: vi.fn(),
}))

describe('User Keys Actions', () => {
    it('allows lab researchers to access the actions, since they now hold keys too', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('lab-public-key')
        const fingerprint = 'lab-fingerprint'
        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getUserPublicKeyAction())
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('getUserPublicKeyAction returns the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('test-public-key')
        const fingerprint = 'test-fingerprint'

        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getUserPublicKeyAction())
        expect(result).toBeDefined()
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('setUserPublicKeyAction sets the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const { publicKey, fingerprint } = await validTestKey()

        await setUserPublicKeyAction({ publicKey })

        // Fingerprint is derived server-side from publicKey, not taken from the client. It must match
        // an independent derivation of the same key.
        const newKeyResult = actionResult(await getUserPublicKeyAction())
        expect(newKeyResult).toBeDefined()
        expect(newKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('setUserPublicKeyAction rejects a key that is not valid SPKI DER', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await setUserPublicKeyAction({
            publicKey: Buffer.from('not-a-real-key').buffer,
        })

        expect(isActionError(result)).toBe(true)
        const stored = actionResult(await getUserPublicKeyAction())
        expect(stored).toBeFalsy()
    })

    it('updateUserPublicKeyAction updates the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData()
        const oldPublicKey = Buffer.from('old-public-key')
        const oldFingerprint = 'old-fingerprint'
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: oldPublicKey, fingerprint: oldFingerprint })
            .execute()

        const { publicKey, fingerprint } = await validTestKey()

        await updateUserPublicKeyAction({ publicKey })

        const updatedKeyResult = actionResult(await getUserPublicKeyAction())
        expect(updatedKeyResult).toBeDefined()
        expect(updatedKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('updateUserPublicKeyAction rejects a key that is not valid SPKI DER', async () => {
        const { user } = await mockSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('old-public-key'), fingerprint: 'old-fingerprint' })
            .execute()

        const result = await updateUserPublicKeyAction({
            publicKey: Buffer.from('still-not-a-key').buffer,
        })

        expect(isActionError(result)).toBe(true)
        const stored = actionResult(await getUserPublicKeyAction())
        expect(stored?.fingerprint).toEqual('old-fingerprint')
    })

    it('stores the generation date, and a rotation advances it without losing the original', async () => {
        const { user } = await mockSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const { publicKey } = await validTestKey()
        const readTimestamps = () =>
            db
                .selectFrom('userPublicKey')
                .select(['createdAt', 'updatedAt'])
                .where('userId', '=', user.id)
                .executeTakeFirstOrThrow()

        await setUserPublicKeyAction({ publicKey })
        const created = await readTimestamps()

        await updateUserPublicKeyAction({ publicKey })
        const rotated = await readTimestamps()

        // OTTER-654 reads these: createdAt stays the first-ever generation, updatedAt tracks the
        // key currently in the user's hands.
        expect(rotated.createdAt).toEqual(created.createdAt)
        expect(rotated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
    })
})

describe('getFirstKeyRedirectAction', () => {
    it('returns the org dashboard when the account belongs to exactly one org', async () => {
        const { org } = await mockSessionWithTestData()

        expect(actionResult(await getFirstKeyRedirectAction())).toEqual(`/${org.slug}/dashboard`)
    })

    // Two orgs means no unambiguous landing, and nothing in orgUser records which one invited the
    // signup, so the action declines rather than guessing.
    it('falls back to My dashboard when the account belongs to more than one org', async () => {
        const { user } = await mockSessionWithTestData()
        const otherOrg = await insertTestOrg({ slug: faker.string.alpha(10) })
        await db.insertInto('orgUser').values({ userId: user.id, orgId: otherOrg.id, isAdmin: false }).execute()

        expect(actionResult(await getFirstKeyRedirectAction())).toEqual('/dashboard')
    })

    it('falls back to My dashboard when the account belongs to no org', async () => {
        const { user } = await mockSessionWithTestData()
        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()

        expect(actionResult(await getFirstKeyRedirectAction())).toEqual('/dashboard')
    })
})
