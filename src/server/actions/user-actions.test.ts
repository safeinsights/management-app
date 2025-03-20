import { describe, it, expect, vi, afterEach } from 'vitest'
import { db } from '@/database'
import { getUserIdByClerkId, getMemberUserPublicKey, findOrCreateSiUserId, createUserAction } from './user-actions'

// Mock the database
vi.mock('@/database', () => ({
    db: {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        transaction: vi.fn(),
    },
}))

describe('User Actions', () => {
    afterEach(() => {
        vi.clearAllMocks() // Reset all mocks between tests
    })

    describe('getUserIdByClerkId', () => {
        it('returns user id when user exists', async () => {
            // Mock the chain of database calls
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue({ id: 'test-id' })
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                select: mockSelect,
            } as never)

            const result = await getUserIdByClerkId('test-clerk-id')

            expect(result).toBe('test-id')
            expect(db.selectFrom).toHaveBeenCalledWith('user')
            expect(mockSelect).toHaveBeenCalledWith(['id'])
            expect(mockWhere).toHaveBeenCalledWith('clerkId', '=', 'test-clerk-id')
        })

        it('returns null when user does not exist', async () => {
            // Mock the chain to return null (user not found)
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                select: mockSelect,
            } as never)

            const result = await getUserIdByClerkId('non-existent-clerk-id')

            expect(result).toBeNull()
        })
    })

    describe('getMemberUserPublicKey', () => {
        it('returns public key when user exists', async () => {
            // Mock the chain of database calls for a successful lookup
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue({ memberUserPublicKey: 'test-public-key' })
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })
            const mockInnerJoin = vi.fn().mockReturnValue({ select: mockSelect })

            vi.mocked(db.selectFrom).mockReturnValue({
                innerJoin: mockInnerJoin,
            } as never)

            const result = await getMemberUserPublicKey('test-clerk-id')

            expect(result).toBe('test-public-key')
            expect(db.selectFrom).toHaveBeenCalledWith('userPublicKey')
            expect(mockInnerJoin).toHaveBeenCalledWith('user', 'userPublicKey.userId', 'user.id')
            expect(mockSelect).toHaveBeenCalledWith(['userPublicKey.publicKey as memberUserPublicKey'])
            expect(mockWhere).toHaveBeenCalledWith('user.clerkId', '=', 'test-clerk-id')
        })

        it('returns undefined when user does not exist', async () => {
            // Mock the chain to return undefined (user not found)
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(undefined)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })
            const mockInnerJoin = vi.fn().mockReturnValue({ select: mockSelect })

            vi.mocked(db.selectFrom).mockReturnValue({
                innerJoin: mockInnerJoin,
            } as never)

            const result = await getMemberUserPublicKey('non-existent-clerk-id')

            expect(result).toBeUndefined()
        })
    })

    describe('findOrCreateSiUserId', () => {
        it('returns existing user id when user exists', async () => {
            // Mock the chain for finding an existing user
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue({ id: 'existing-user-id', isResearcher: true })
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelect = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                select: mockSelect,
            } as never)

            const result = await findOrCreateSiUserId('existing-clerk-id', 'Test User')

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

            const result = await findOrCreateSiUserId('new-clerk-id', 'New Test User')

            expect(result).toBe('new-user-id')

            // Verify select was called first
            expect(db.selectFrom).toHaveBeenCalledWith('user')

            // Verify insert was called with correct values
            expect(db.insertInto).toHaveBeenCalledWith('user')
            expect(mockValues).toHaveBeenCalledWith({
                name: 'New Test User',
                clerkId: 'new-clerk-id',
                isResearcher: true,
            })
        })
    })

    describe('createUserAction', () => {
        it('creates a new user and member_user record successfully', async () => {
            // Mock transaction execution
            const mockExecute = vi.fn().mockImplementation(async (callback) => {
                // Create a mock transaction object
                const trx = {
                    selectFrom: vi.fn(),
                    insertInto: vi.fn(),
                }

                // Mock the select that checks for existing user (returns none)
                const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
                const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
                trx.selectFrom.mockReturnValue({
                    select: vi.fn().mockReturnValue({ where: mockWhere }),
                })

                // Mock the user insert
                const mockUserExecute = vi.fn().mockResolvedValue([{ id: 'new-user-id' }])
                const mockUserReturningAll = vi.fn().mockReturnValue({ execute: mockUserExecute })
                const mockUserValues = vi.fn().mockReturnValue({ returningAll: mockUserReturningAll })

                // Mock the member_user insert
                const mockMemberUserExecute = vi.fn().mockResolvedValue([{ id: 'new-member-user-id' }])
                const mockMemberUserReturningAll = vi.fn().mockReturnValue({ execute: mockMemberUserExecute })
                const mockMemberUserValues = vi.fn().mockReturnValue({ returningAll: mockMemberUserReturningAll })

                // Set up the insertInto mock to handle both user and memberUser inserts
                trx.insertInto.mockImplementation((table) => {
                    if (table === 'user') {
                        return { values: mockUserValues }
                    } else if (table === 'memberUser') {
                        return { values: mockMemberUserValues }
                    }
                    throw new Error(`Unexpected table: ${table}`)
                })

                // Execute the callback with our mock transaction
                return await callback(trx)
            })

            vi.mocked(db.transaction).mockReturnValue({
                execute: mockExecute,
            } as never)

            const result = await createUserAction(
                'test-clerk-id',
                'Test User',
                true,
                'test-member-id',
                true
            )

            expect(result).toEqual({ id: 'new-user-id' })
            expect(db.transaction).toHaveBeenCalled()
            expect(mockExecute).toHaveBeenCalled()
        })

        it('throws an error when user already exists', async () => {
            // Mock transaction execution for existing user scenario
            const mockExecute = vi.fn().mockImplementation(async (callback) => {
                const trx = {
                    selectFrom: vi.fn(),
                }

                // Mock the select that finds an existing user
                const mockExecuteTakeFirst = vi.fn().mockResolvedValue({ id: 'existing-user-id' })
                const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
                trx.selectFrom.mockReturnValue({
                    select: vi.fn().mockReturnValue({ where: mockWhere }),
                })

                // Execute the callback with our mock transaction
                return await callback(trx)
            })

            vi.mocked(db.transaction).mockReturnValue({
                execute: mockExecute,
            } as never)

            await expect(
                createUserAction('existing-clerk-id', 'Test User', true, 'test-member-id', true)
            ).rejects.toThrow('User with clerkId existing-clerk-id already exists')
        })

        it('throws an error when user insert fails', async () => {
            // Mock transaction execution for user insert failure
            const mockExecute = vi.fn().mockImplementation(async (callback) => {
                const trx = {
                    selectFrom: vi.fn(),
                    insertInto: vi.fn(),
                }

                // Mock the select that checks for existing user (returns none)
                const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
                const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
                trx.selectFrom.mockReturnValue({
                    select: vi.fn().mockReturnValue({ where: mockWhere }),
                })

                // Mock the user insert to return empty array (failure)
                const mockUserExecute = vi.fn().mockResolvedValue([])
                const mockUserReturningAll = vi.fn().mockReturnValue({ execute: mockUserExecute })
                const mockUserValues = vi.fn().mockReturnValue({ returningAll: mockUserReturningAll })

                trx.insertInto.mockReturnValue({ values: mockUserValues })

                // Execute the callback with our mock transaction
                return await callback(trx)
            })

            vi.mocked(db.transaction).mockReturnValue({
                execute: mockExecute,
            } as never)

            await expect(
                createUserAction('test-clerk-id', 'Test User', true, 'test-member-id', true)
            ).rejects.toThrow('Failed to create user in DB')
        })

        it('throws an error when member_user insert fails', async () => {
            // Mock transaction execution for member_user insert failure
            const mockExecute = vi.fn().mockImplementation(async (callback) => {
                const trx = {
                    selectFrom: vi.fn(),
                    insertInto: vi.fn(),
                }

                // Mock the select that checks for existing user (returns none)
                const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
                const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
                trx.selectFrom.mockReturnValue({
                    select: vi.fn().mockReturnValue({ where: mockWhere }),
                })

                // Mock the user insert to succeed
                const mockUserExecute = vi.fn().mockResolvedValue([{ id: 'new-user-id' }])
                const mockUserReturningAll = vi.fn().mockReturnValue({ execute: mockUserExecute })
                const mockUserValues = vi.fn().mockReturnValue({ returningAll: mockUserReturningAll })

                // Mock the member_user insert to fail (empty array)
                const mockMemberUserExecute = vi.fn().mockResolvedValue([])
                const mockMemberUserReturningAll = vi.fn().mockReturnValue({ execute: mockMemberUserExecute })
                const mockMemberUserValues = vi.fn().mockReturnValue({ returningAll: mockMemberUserReturningAll })

                // Set up the insertInto mock to handle both user and memberUser inserts
                trx.insertInto.mockImplementation((table) => {
                    if (table === 'user') {
                        return { values: mockUserValues }
                    } else if (table === 'memberUser') {
                        return { values: mockMemberUserValues }
                    }
                    throw new Error(`Unexpected table: ${table}`)
                })

                // Execute the callback with our mock transaction
                return await callback(trx)
            })

            vi.mocked(db.transaction).mockReturnValue({
                execute: mockExecute,
            } as never)

            await expect(
                createUserAction('test-clerk-id', 'Test User', true, 'test-member-id', true)
            ).rejects.toThrow('Failed to create member_user record')
        })
    })
})
