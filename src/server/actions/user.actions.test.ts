import { describe, it, expect, test, vi } from 'vitest'
import { db } from '@/database'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import {
    insertTestOrg,
    insertTestUser,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { faker } from '@faker-js/faker'
import { onUserResetPWAction, onUserSignInAction, syncUserMetadataAction, updateUserRoleAction } from './user.actions'
import logger from '@/lib/logger'

vi.mock('@/server/events')

describe('User Actions', () => {
    it('findOrCreateSiUserId returns existing user id when user exists', async () => {
        const org = await insertTestOrg()
        const { user } = await insertTestUser({ org })

        const foundUserId = await findOrCreateSiUserId(user.clerkId)
        expect(foundUserId).toBe(user.id)
    })

    it('findOrCreateSiUserId creates and returns new user id when user does not exist', async () => {
        const clerkId = faker.string.uuid()
        const userId = await findOrCreateSiUserId(clerkId)
        const foundUser = await db
            .selectFrom('user')
            .select('id')
            .where('clerkId', '=', clerkId)
            .executeTakeFirstOrThrow()
        expect(userId).toEqual(foundUser.id)
    })

    test('onUserSignInAction should create a new user and redirect to reviewer key page', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'enclave' })

        // Manually remove the auto-created key for this test
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await onUserSignInAction()

        const dbUser = await db.selectFrom('user').where('id', '=', user.id).selectAll('user').executeTakeFirstOrThrow()
        expect(dbUser.clerkId).toBe(user.clerkId)
        expect(result).toEqual({ redirectToKeyGeneration: true })
    })

    test('onUserSignInAction should not redirect if user has a public key', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })
        const result = await onUserSignInAction()
        expect(result).toEqual({})
    })

    test('onUserSignInAction should redirect lab researchers without a key to the key page', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await onUserSignInAction()
        expect(result).toEqual({ redirectToKeyGeneration: true })
    })

    test('onUserSignInAction prompts a multi-org account without a key, evaluated at the account level', async () => {
        // Account belongs to BOTH a lab and an enclave org. Enforcement keys off the account,
        // not any single org membership, so a keyless account is prompted exactly once.
        const { user } = await mockDualRoleSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await onUserSignInAction()
        expect(result).toEqual({ redirectToKeyGeneration: true })
    })

    test('onUserSignInAction does not prompt a multi-org account holding a single account-level key', async () => {
        // One key at the account level satisfies enforcement across every org the account joins.
        const { user } = await mockDualRoleSessionWithTestData()
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('account-key'), fingerprint: 'account-fingerprint' })
            .execute()

        const result = await onUserSignInAction()
        expect(result).toEqual({})
    })

    test('syncUserMetadataAction should sync metadata', async () => {
        await mockSessionWithTestData()
        const result = await syncUserMetadataAction()
        expect(result).toBeDefined()
    })

    test('onUserResetPWAction should run without error', async () => {
        await mockSessionWithTestData()
        await onUserResetPWAction()
    })

    test('updateUserRoleAction rejects calls from non-admin', async () => {
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { org } = await mockSessionWithTestData({ isAdmin: false })
        const { user: userToUpdate } = await insertTestUser({ org })

        const result = await updateUserRoleAction({
            orgSlug: org.slug,
            userId: userToUpdate.id,
            isAdmin: true,
        })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })

    test('updateUserRoleAction should update user roles in the database', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })
        const { user: userToUpdate } = await insertTestUser({ org })

        await updateUserRoleAction({
            orgSlug: org.slug,
            userId: userToUpdate.id,
            isAdmin: true,
        })

        const updatedUser = await db
            .selectFrom('orgUser')
            .selectAll('orgUser')
            .where('userId', '=', userToUpdate.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.isAdmin).toBe(true)
        // In the new structure, roles are determined by org type, not user fields
    })
})
