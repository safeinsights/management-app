import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { currentUser } from '@clerk/nextjs/server'
import { db, insertTestOrg, insertTestUser, faker } from '@/tests/unit.helpers'

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

    it('should update existing user when clerk user already exists in database by clerkId', async () => {
        const org = await insertTestOrg()
        const { user } = await insertTestUser({ org })

        const clerkUser = {
            id: user.clerkId, // Same clerkId as existing user
            firstName: 'Updated',
            lastName: 'Name',
            primaryEmailAddress: { emailAddress: user.email },
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
        expect(updatedUser.clerkId).toBe(user.clerkId)
    })

    it('should resolve email conflict by reassigning old user to new clerkId in non-production', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })
        const originalEmail = existingUser.email!
        const newClerkId = faker.string.alpha(10)

        const clerkUser = {
            id: newClerkId, // Different clerkId
            firstName: 'New',
            lastName: 'User',
            primaryEmailAddress: { emailAddress: originalEmail }, // Same email as existing user
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        const result = await syncCurrentClerkUser()

        // Should return the existing user's ID (not create a new one)
        expect(result.id).toBe(existingUser.id)

        // Existing user should have updated clerkId and name
        const updatedUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.clerkId).toBe(newClerkId)
        expect(updatedUser.firstName).toBe('New')
        expect(updatedUser.lastName).toBe('User')
        expect(updatedUser.email).toBe(originalEmail) // Email preserved
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

    it('should throw error when user has no email address', async () => {
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: null,
            lastName: null,
            primaryEmailAddress: null,
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        await expect(syncCurrentClerkUser()).rejects.toThrow('User has no email address')
    })

    it('should handle missing firstName and lastName gracefully', async () => {
        const clerkUser = {
            id: faker.string.alpha(10),
            firstName: null,
            lastName: null,
            primaryEmailAddress: { emailAddress: 'test@example.com' },
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
        expect(createdUser.email).toBe('test@example.com')
    })

    // Note: Org membership sync from Clerk metadata has been removed.
    // App DB is now the source of truth for org memberships.
    // syncCurrentClerkUser only syncs user profile data (name, email).
})
