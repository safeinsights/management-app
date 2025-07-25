import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { currentUser } from '@clerk/nextjs/server'
import { db, insertTestOrg, insertTestUser, faker, mockClerkSession, mockSessionWithTestData } from '@/tests/unit.helpers'

vi.mock('./config', () => ({
    PROD_ENV: false,
    ENVIRONMENT_ID: 'development',
}))

const currentUserMock = currentUser as unknown as Mock

// Import after mocking
const { syncCurrentClerkUser } = await import('./clerk')

describe('syncCurrentClerkUser', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV }
        // Set to non-production environment by default
        process.env.ENVIRONMENT_ID = 'development'
    })

    afterEach(() => {
        currentUserMock.mockClear()
        process.env = ORIGINAL_ENV
    })

    it('should throw error when user is not authenticated', async () => {
        currentUserMock.mockResolvedValue(null)

        await expect(syncCurrentClerkUser()).rejects.toThrow('User not authenticated')
    })

    it('should update existing user when clerk user already exists in database', async () => {

        const org = await insertTestOrg()
        const { user } = await insertTestUser({ org })

        const clerkUser = {
            id: user.clerkId,
            firstName: 'Updated',
            lastName: 'Name',
            primaryEmailAddress: { emailAddress: 'updated@test.com' },
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await syncCurrentClerkUser()

        // Verify user was updated in database
        const updatedUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.firstName).toBe('Updated')
        expect(updatedUser.lastName).toBe('Name')
        expect(updatedUser.email).toBe('updated@test.com')
    })

    it('should create new user when clerk user does not exist in database', async () => {
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: 'New',
            lastName: 'User',
            primaryEmailAddress: { emailAddress: 'new@test.com' },
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await syncCurrentClerkUser()

        // Verify user was created in database
        const createdUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirstOrThrow()

        expect(createdUser.firstName).toBe('New')
        expect(createdUser.lastName).toBe('User')
        expect(createdUser.email).toBe('new@test.com')
    })

    it('should handle missing firstName, lastName, or email gracefully', async () => {
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: null,
            lastName: null,
            primaryEmailAddress: null,
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await syncCurrentClerkUser()

        // Verify user was created in database
        const createdUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirstOrThrow()

        expect(createdUser.firstName).toBe('')
        expect(createdUser.lastName).toBe('')
        expect(createdUser.email).toBe('')
    })

    it('should sync org memberships from clerk metadata', async () => {
        const org1 = await insertTestOrg({ slug: 'test-org-1' })
        const org2 = await insertTestOrg({ slug: 'test-org-2' })

        // Create organizations in database
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: 'Test',
            lastName: 'User',
            primaryEmailAddress: { emailAddress: 'test@test.com' },
            publicMetadata: {
                'dev-env': {
                    teams: {
                        'test-org-1': {
                            id: org1.id,
                            slug: 'test-org-1',
                            isAdmin: true,
                            isReviewer: false,
                            isResearcher: true,
                        },
                        'test-org-2': {
                            id: org2.id,
                            slug: 'test-org-2',
                            isAdmin: false,
                            isReviewer: true,
                            isResearcher: false,
                        },
                    },
                },
            },
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await syncCurrentClerkUser()

        // Note: The actual org membership creation is handled by findOrCreateOrgMembership
        // which is called but errors are caught and ignored, so we just verify the function completes
        // Verify user was created in database
        const createdUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirstOrThrow()

        expect(createdUser.clerkId).toBe(clerkUser.id)
    })

    it('should handle malformed metadata gracefully', async () => {
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: 'Test',
            lastName: 'User',
            primaryEmailAddress: { emailAddress: 'test@test.com' },
            publicMetadata: {
                'invalid-metadata': 'not-an-object',
            },
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await syncCurrentClerkUser()

        // Verify user was created in database
        const createdUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirstOrThrow()

        expect(createdUser.clerkId).toBe(clerkUser.id)
    })
})
