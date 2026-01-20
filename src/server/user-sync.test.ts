import { describe, it, expect, vi } from 'vitest'
import { db, insertTestOrg, insertTestUser, faker } from '@/tests/unit.helpers'

const mockProdEnv = vi.hoisted(() => ({ value: false }))

vi.mock('./config', async (importOriginal) => {
    const original = await importOriginal<typeof import('./config')>()
    return {
        ...original,
        get PROD_ENV() {
            return mockProdEnv.value
        },
    }
})

// Import after mock is set up
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

    it('should resolve email conflict by reassigning old user to new clerkId in non-production', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })
        const originalEmail = existingUser.email!
        const newClerkId = faker.string.alpha(10)

        const attrs = {
            clerkId: newClerkId, // Different clerkId
            firstName: 'New',
            lastName: 'User',
            email: originalEmail, // Same email
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        // Should return the existing user's ID (not create a new one)
        expect(result.id).toBe(existingUser.id)
        expect(result.emailConflictResolved).toBeDefined()
        expect(result.emailConflictResolved?.previousUserId).toBe(existingUser.id)
        expect(result.emailConflictResolved?.email).toBe(originalEmail)

        // Old user should have updated clerkId and name
        const updatedUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.clerkId).toBe(newClerkId)
        expect(updatedUser.firstName).toBe('New')
        expect(updatedUser.lastName).toBe('User')
        expect(updatedUser.email).toBe(originalEmail) // Email preserved

        // No new user should be created
        const userCount = await db
            .selectFrom('user')
            .select((eb) => eb.fn.count('id').as('count'))
            .where('email', '=', originalEmail)
            .executeTakeFirstOrThrow()

        expect(Number(userCount.count)).toBe(1)
    })

    it('should handle case-insensitive email matching for conflicts', async () => {
        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })
        const newClerkId = faker.string.alpha(10)

        // Update existing user's email to mixed case
        await db.updateTable('user').set({ email: 'Test@Example.COM' }).where('id', '=', existingUser.id).execute()

        const attrs = {
            clerkId: newClerkId,
            firstName: 'New',
            lastName: 'User',
            email: 'test@example.com', // Different case
        }

        const result = await db.transaction().execute(async (trx) => {
            return syncUserToDatabase(attrs, trx)
        })

        expect(result.id).toBe(existingUser.id)
        expect(result.emailConflictResolved).toBeDefined()
        expect(result.emailConflictResolved?.previousUserId).toBe(existingUser.id)

        // Old user should have updated clerkId
        const updatedUser = await db
            .selectFrom('user')
            .selectAll('user')
            .where('id', '=', existingUser.id)
            .executeTakeFirstOrThrow()

        expect(updatedUser.clerkId).toBe(newClerkId)
        expect(updatedUser.email).toBe('Test@Example.COM') // Original email preserved
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

describe('syncUserToDatabase in production', () => {
    it('should throw an exception on email conflict in production', async () => {
        // Reset modules and re-mock with PROD_ENV = true
        vi.resetModules()
        vi.doMock('./config', async (importOriginal) => {
            const original = await importOriginal<typeof import('./config')>()
            return {
                ...original,
                PROD_ENV: true,
            }
        })

        // Dynamically import after mock is set up
        const { syncUserToDatabase: syncUserToDatabaseProd } = await import('./user-sync')

        const org = await insertTestOrg()
        const { user: existingUser } = await insertTestUser({ org })

        const attrs = {
            clerkId: faker.string.alpha(10), // Different clerkId
            firstName: 'New',
            lastName: 'User',
            email: existingUser.email!, // Same email - conflict
        }

        await expect(
            db.transaction().execute(async (trx) => {
                return syncUserToDatabaseProd(attrs, trx)
            }),
        ).rejects.toThrow(/Email conflict during user sync/)
    })
})
