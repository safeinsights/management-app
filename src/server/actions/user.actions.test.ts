import { describe, it, expect, vi } from 'vitest'
import { CLERK_ADMIN_ORG_SLUG } from '@/server/config'
import { db } from '@/database'
import { findOrCreateSiUserId } from '@/server/db/mutations'

// Mock the database
vi.mock('@/database', () => ({
    db: {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        transaction: vi.fn(),
    },
}))

describe('User Actions', () => {
    describe('findOrCreateSiUserId', () => {
        it('returns existing user id when user exists', async () => {
            // Mock the chain for finding an existing user
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue({ id: 'existing-user-id', isResearcher: true })
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                select: mockSelect,
            } as never)

            const result = await findOrCreateSiUserId('existing-clerk-id', { firstName: 'Test User' })

            expect(result).toBe('existing-user-id')
            expect(db.selectFrom).toHaveBeenCalledWith('user')
            expect(mockSelect).toHaveBeenCalledWith(['id', 'isResearcher'])
            expect(mockWhere).toHaveBeenCalledWith('clerkId', '=', 'existing-clerk-id')
        })

        it('creates and returns new user id when user does not exist', async () => {
            // First mock the select that returns no user
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                select: mockSelect,
            } as never)

            // Then mock the insert for creating a new user
            const mockExecuteTakeFirstOrThrow = vi.fn().mockResolvedValue({ id: 'new-user-id' })
            const mockReturningAll = vi.fn().mockReturnValue({ executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow })
            const mockValues = vi.fn().mockReturnValue({ returningAll: mockReturningAll })

            vi.mocked(db.insertInto).mockReturnValue({
                values: mockValues,
            } as never)

            const result = await findOrCreateSiUserId('new-clerk-id', { firstName: 'New Test User' })

            expect(result).toBe('new-user-id')

            // Verify select was called first
            expect(db.selectFrom).toHaveBeenCalledWith('user')

            // Verify insert was called with correct values
            expect(db.insertInto).toHaveBeenCalledWith('user')
            expect(mockValues).toHaveBeenCalledWith({
                firstName: 'New Test User',
                clerkId: 'new-clerk-id',
                isResearcher: false,
            })
        })
    })
})
