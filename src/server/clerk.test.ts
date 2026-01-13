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

    it('should resolve email conflict by nullifying old user email when different clerkId claims it', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })
        const originalEmail = existingUser.email!

        const clerkUser = {
            id: faker.string.alpha(10), // Different clerkId
            firstName: 'New',
            lastName: 'User',
            primaryEmailAddress: { emailAddress: originalEmail }, // Same email as existing user
            publicMetadata: {},
        }

        currentUserMock.mockResolvedValue(clerkUser)

        const result = await syncCurrentClerkUser()

        // New user should be created with the email
        const newUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirstOrThrow()

        expect(newUser.email).toBe(originalEmail)
        expect(result.id).toBe(newUser.id)

        // Old user should have null email
        const oldUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(oldUser.email).toBeNull()
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
