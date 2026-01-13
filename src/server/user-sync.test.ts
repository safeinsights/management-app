import { describe, it, expect, vi } from 'vitest'
import { db, insertTestOrg, insertTestUser, faker } from '@/tests/unit.helpers'
import { syncUserToDatabase, syncUserToDatabaseWithConflictResolution } from './user-sync'

describe('syncUserToDatabase', () => {
    it('should create new user when clerkId does not exist', async () => {
        const attrs = {
            clerkId: faker.string.alpha(10),
            firstName: 'Test',
            lastName: 'User',
            email: faker.internet.email({ provider: 'test.com' }),
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        expect(result.id).toBeDefined()
        expect(result.emailConflictResolved).toBeUndefined()

        const user = await db.selectFrom('user').selectAll('user').where('id', '=', result.id).executeTakeFirstOrThrow()

        expect(user.clerkId).toBe(attrs.clerkId)
        expect(user.email).toBe(attrs.email)
        expect(user.firstName).toBe('Test')
        expect(user.lastName).toBe('User')
    })

    it('should update existing user when clerkId exists', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })

        const attrs = {
            clerkId: existingUser.clerkId,
            firstName: 'Updated',
            lastName: 'Name',
            email: 'updated@test.com',
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        expect(result.id).toBe(existingUser.id)
        expect(result.emailConflictResolved).toBeUndefined()

        const user = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(user.firstName).toBe('Updated')
        expect(user.lastName).toBe('Name')
        expect(user.email).toBe('updated@test.com')
    })

    it('should resolve email conflict by nullifying old user email', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })
        const originalEmail = existingUser.email!

        const attrs = {
            clerkId: faker.string.alpha(10), // Different clerkId
            firstName: 'New',
            lastName: 'User',
            email: originalEmail, // Same email
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        expect(result.emailConflictResolved).toBeDefined()
        expect(result.emailConflictResolved?.previousUserId).toBe(existingUser.id)
        expect(result.emailConflictResolved?.email).toBe(originalEmail)

        // Old user should have null email
        const oldUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(oldUser.email).toBeNull()

        // New user should have the email
        const newUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', result.id)
            .executeTakeFirstOrThrow()

        expect(newUser.email).toBe(originalEmail)
    })

    it('should handle case-insensitive email matching for conflicts', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })

        // Update existing user's email to mixed case
        await db.updateTable('user').set({ email: 'Test@Example.COM' }).where('id', '=', existingUser.id).execute()

        const attrs = {
            clerkId: faker.string.alpha(10),
            firstName: 'New',
            lastName: 'User',
            email: 'test@example.com', // Different case
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        expect(result.emailConflictResolved).toBeDefined()
        expect(result.emailConflictResolved?.previousUserId).toBe(existingUser.id)

        // Old user should have null email
        const oldUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(oldUser.email).toBeNull()
    })
})

describe('syncUserToDatabaseWithConflictResolution', () => {
    it('should call onConflictResolved callback when email conflict occurs', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })

        const onConflictResolved = vi.fn()

        const attrs = {
            clerkId: faker.string.alpha(10),
            firstName: 'New',
            lastName: 'User',
            email: existingUser.email!,
        }

        await syncUserToDatabaseWithConflictResolution(attrs, onConflictResolved)

        expect(onConflictResolved).toHaveBeenCalledWith(existingUser.id)
    })

    it('should not call onConflictResolved when no conflict', async () => {
        const onConflictResolved = vi.fn()

        const attrs = {
            clerkId: faker.string.alpha(10),
            firstName: 'New',
            lastName: 'User',
            email: faker.internet.email({ provider: 'test.com' }),
        }

        await syncUserToDatabaseWithConflictResolution(attrs, onConflictResolved)

        expect(onConflictResolved).not.toHaveBeenCalled()
    })

    it('should handle callback errors gracefully', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })

        const onConflictResolved = vi.fn().mockRejectedValue(new Error('Callback failed'))

        const attrs = {
            clerkId: faker.string.alpha(10),
            firstName: 'New',
            lastName: 'User',
            email: existingUser.email!,
        }

        // Should not throw even if callback fails
        await expect(syncUserToDatabaseWithConflictResolution(attrs, onConflictResolved)).resolves.toBeDefined()

        // But callback should have been called
        expect(onConflictResolved).toHaveBeenCalledWith(existingUser.id)
    })
})
