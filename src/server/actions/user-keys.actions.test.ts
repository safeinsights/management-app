import { describe, expect, it, vi } from 'vitest'
import { mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    getReviewerPublicKeyAction,
    setReviewerPublicKeyAction,
    updateReviewerPublicKeyAction,
} from './user-keys.actions'
import { db } from '@/database'
import logger from '@/lib/logger'

vi.mock('@/server/events', () => ({
    onUserPublicKeyCreated: vi.fn(),
    onUserPublicKeyUpdated: vi.fn(),
}))

describe('User Keys Actions', () => {
    it('only allows reviewer users to access the actions', async () => {
        await mockSessionWithTestData({ isReviewer: false })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        try {
            actionResult(await getReviewerPublicKeyAction())
            expect.fail('Expected an error to be thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toMatch(/cannot view ReviewerKey/)
        }
    })

    it('getReviewerPublicKeyAction returns the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ isReviewer: true })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        const publicKey = Buffer.from('test-public-key')
        const fingerprint = 'test-fingerprint'

        await db.insertInto('userPublicKey').values({ userId: user.id, publicKey, fingerprint }).execute()

        const result = actionResult(await getReviewerPublicKeyAction())
        expect(result).toBeDefined()
        expect(result?.fingerprint).toEqual(fingerprint)
    })

    it('setReviewerPublicKeyAction sets the public key for the current user', async () => {
        const { user } = await mockSessionWithTestData({ isReviewer: true })
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
