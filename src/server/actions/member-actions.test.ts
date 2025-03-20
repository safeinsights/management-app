import { describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { Member } from '@/schema/member'
import { deleteMemberAction, fetchMembersAction, getMemberFromIdentifier, upsertMemberAction } from './member-actions'

// Mock the database
vi.mock('@/database', () => ({
    db: {
        insertInto: vi.fn(),
        selectFrom: vi.fn(),
        deleteFrom: vi.fn(),
    },
}))

const mockMember: Member = {
    id: '1',
    identifier: 'test-member',
    name: 'Test Member',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('Member Actions', () => {
    describe('upsertMemberAction', () => {
        it('throws error when duplicate organization name exists for new member', async () => {
            // Construct a new member without an "id"
            const newMember = {
                identifier: 'new-org',
                name: 'Duplicate Org',
                email: 'duplicate@example.com',
                publicKey: 'duplicate-key',
            }

            // Simulate that a member with the same name already exists
            const duplicateRecord = { id: 'duplicate-id' }
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(duplicateRecord)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })

            // Override db.selectFrom chain for duplicate check
            vi.mocked(db.selectFrom).mockReturnValue({
                select: () => ({ where: mockWhere }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)

            await expect(upsertMemberAction(newMember)).rejects.toThrow('Organization with this name already exists')
        })
        it('successfully inserts a new member', async () => {
            const mockExecute = vi.fn().mockResolvedValue([mockMember])
            const mockReturningAll = vi.fn().mockReturnValue({ execute: mockExecute })
            const mockOnConflict = vi.fn().mockReturnValue({ returningAll: mockReturningAll })
            const mockValues = vi.fn().mockReturnValue({ onConflict: mockOnConflict })

            vi.mocked(db.insertInto).mockReturnValue({
                values: mockValues,
            } as never)

            const result = await upsertMemberAction(mockMember)

            expect(result).toEqual(mockMember)
            expect(db.insertInto).toHaveBeenCalledWith('member')
            expect(mockValues).toHaveBeenCalledWith(mockMember)
        })

        it('throws error when insert fails', async () => {
            const mockExecute = vi.fn().mockResolvedValue([])
            const mockReturningAll = vi.fn().mockReturnValue({ execute: mockExecute })
            const mockOnConflict = vi.fn().mockReturnValue({ returningAll: mockReturningAll })
            const mockValues = vi.fn().mockReturnValue({ onConflict: mockOnConflict })

            vi.mocked(db.insertInto).mockReturnValue({
                values: mockValues,
            } as never)

            await expect(upsertMemberAction(mockMember)).rejects.toThrow('Failed to insert member')
        })
    })

    describe('fetchMembersAction', () => {
        it('returns all members', async () => {
            const mockMembers = [mockMember, { ...mockMember, id: '2', identifier: 'test-2' }]
            const mockExecute = vi.fn().mockResolvedValue(mockMembers)
            const mockSelectAll = vi.fn().mockReturnValue({ execute: mockExecute })

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: mockSelectAll,
            } as never)

            const result = await fetchMembersAction()

            expect(result).toEqual(mockMembers)
            expect(db.selectFrom).toHaveBeenCalledWith('member')
            expect(mockSelectAll).toHaveBeenCalledWith('member')
        })
    })

    describe('deleteMemberAction', () => {
        it('deletes member by identifier', async () => {
            const mockExecute = vi.fn().mockResolvedValue(undefined)
            const mockWhere = vi.fn().mockReturnValue({ execute: mockExecute })

            vi.mocked(db.deleteFrom).mockReturnValue({
                where: mockWhere,
            } as never)

            await deleteMemberAction('test-member')

            expect(db.deleteFrom).toHaveBeenCalledWith('member')
            expect(mockWhere).toHaveBeenCalledWith('identifier', '=', 'test-member')
        })
    })

    describe('getMemberFromIdentifier', () => {
        it('returns member when found', async () => {
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(mockMember)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelectAll = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: mockSelectAll,
            } as never)

            const result = await getMemberFromIdentifier('test-member')

            expect(result).toEqual(mockMember)
            expect(db.selectFrom).toHaveBeenCalledWith('member')
            expect(mockWhere).toHaveBeenCalledWith('identifier', '=', 'test-member')
        })

        it('returns undefined when member not found', async () => {
            const mockExecuteTakeFirst = vi.fn().mockResolvedValue(undefined)
            const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst })
            const mockSelectAll = vi.fn().mockReturnValue({ where: mockWhere })

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: mockSelectAll,
            } as never)

            const result = await getMemberFromIdentifier('non-existent')

            expect(result).toBeUndefined()
        })
    })
})
