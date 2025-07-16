import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    getReviewerPublicKeyAction,
    setReviewerPublicKeyAction,
    updateReviewerPublicKeyAction,
} from './user-keys.actions'
import { db } from '@/database'

vi.mock('@/server/events', () => ({
    onUserPublicKeyCreated: vi.fn(),
    onUserPublicKeyUpdated: vi.fn(),
}))

describe('User Keys Actions', () => {
    it('only allows reviewer users to access the actions', async () => {
        await mockSessionWithTestData({ isReviewer: false })
        await expect(getReviewerPublicKeyAction()).rejects.toThrow(/cannot read ReviewerKey/)
    })

    it('getReviewerPublicKeyAction returns the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ isReviewer: true })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('test-public-key')
        const fingerprint = 'test-fingerprint'

        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = await getReviewerPublicKeyAction()
        expect(result).toBeDefined()
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('setReviewerPublicKeyAction sets the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ isReviewer: true })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('new-public-key').buffer
        const fingerprint = 'new-fingerprint'

        await setReviewerPublicKeyAction({ publicKey, fingerprint })

        const newKey = await getReviewerPublicKeyAction()
        expect(newKey).toBeDefined()
        expect(newKey?.fingerprint).toEqual(fingerprint)
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

        const updatedKey = await getReviewerPublicKeyAction()
        expect(updatedKey).toBeDefined()
        expect(updatedKey?.fingerprint).toEqual(newFingerprint)
    })
})
