import { describe, it, expect, test, vi } from 'vitest'
import { db } from '@/database'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { insertTestOrg, insertTestUser, mockSessionWithTestData } from '@/tests/unit.helpers'
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
        const { user } = await mockSessionWithTestData({ isReviewer: true })

        // Manually remove the auto-created key for this test
        await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

        const result = await onUserSignInAction()

        const dbUser = await db.selectFrom('user').where('id', '=', user.id).selectAll('user').executeTakeFirstOrThrow()
        expect(dbUser.clerkId).toBe(user.clerkId)
        expect(result).toEqual({ redirectToReviewerKey: true })
    })

    test('onUserSignInAction should not redirect if user has a public key', async () => {
        await mockSessionWithTestData({ isReviewer: true })
        const result = await onUserSignInAction()
        expect(result).toBeUndefined()
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
            isResearcher: false,
            isReviewer: true,
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
            isResearcher: false,
            isReviewer: true,
        })

        const updatedUser = await db
            .selectFrom('orgUser')
            .selectAll('orgUser')
            .where('userId', '=', userToUpdate.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.isAdmin).toBe(true)
        expect(updatedUser.isResearcher).toBe(false)
        expect(updatedUser.isReviewer).toBe(true)
    })
})
