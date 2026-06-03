import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    getReviewerPublicKeyAction,
    setReviewerPublicKeyAction,
    updateReviewerPublicKeyAction,
} from './user-keys.actions'
import { db } from '@/database'

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

        const result = actionResult(await getReviewerPublicKeyAction())
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('getReviewerPublicKeyAction returns the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('test-public-key')
        const fingerprint = 'test-fingerprint'

        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getReviewerPublicKeyAction())
        expect(result).toBeDefined()
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('setReviewerPublicKeyAction sets the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('new-public-key').buffer
        const fingerprint = 'new-fingerprint'

        await setReviewerPublicKeyAction({ publicKey, fingerprint })

        const newKeyResult = actionResult(await getReviewerPublicKeyAction())
        expect(newKeyResult).toBeDefined()
        expect(newKeyResult?.fingerprint).toEqual(fingerprint)
    })

    it('updateReviewerPublicKeyAction updates the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData()
        const oldPublicKey = Buffer.from('old-public-key')
        const oldFingerprint = 'old-fingerprint'
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: oldPublicKey, fingerprint: oldFingerprint })
            .execute()

        const newPublicKey = Buffer.from('new-public-key-for-update').buffer
        const newFingerprint = 'new-fingerprint-for-update'

        await updateReviewerPublicKeyAction({ publicKey: newPublicKey, fingerprint: newFingerprint })

        const updatedKeyResult = actionResult(await getReviewerPublicKeyAction())
        expect(updatedKeyResult).toBeDefined()
        expect(updatedKeyResult?.fingerprint).toEqual(newFingerprint)
    })
})
