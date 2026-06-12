import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult, readTestSupportFile } from '@/tests/unit.helpers'
import { getUserPublicKeyAction, setUserPublicKeyAction, updateUserPublicKeyAction } from './user-keys.actions'
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

        await setUserPublicKeyAction({ publicKey, fingerprint })

        const newKeyResult = actionResult(await getUserPublicKeyAction())
        expect(newKeyResult).toBeDefined()
        expect(newKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('setUserPublicKeyAction rejects a key that is not valid SPKI DER', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await setUserPublicKeyAction({
            publicKey: Buffer.from('not-a-real-key').buffer,
            fingerprint: 'garbage-fingerprint',
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

        await updateUserPublicKeyAction({ publicKey, fingerprint })

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
            fingerprint: 'garbage-fingerprint',
        })

        expect(isActionError(result)).toBe(true)
        const stored = actionResult(await getUserPublicKeyAction())
        expect(stored?.fingerprint).toEqual('old-fingerprint')
    })
})
