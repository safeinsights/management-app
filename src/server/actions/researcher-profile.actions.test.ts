import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/database'
import { mockSessionWithTestData } from '@/tests/unit.helpers'
import { updatePersonalInfoAction } from './researcher-profile.actions'
import { updateClerkUserName, updateClerkUserMetadata } from '@/server/clerk'

vi.mock('@/server/clerk', () => ({
    updateClerkUserName: vi.fn(),
    updateClerkUserMetadata: vi.fn(),
}))

describe('researcher-profile.actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('updatePersonalInfoAction', () => {
        it('should not update DB if Clerk update fails', async () => {
            const { user } = await mockSessionWithTestData()
            const originalFirstName = user.firstName
            const originalLastName = user.lastName

            vi.mocked(updateClerkUserName).mockRejectedValueOnce(new Error('Clerk error'))

            const result = await updatePersonalInfoAction({ firstName: 'Jane', lastName: 'Smith' })

            // Clerk was called
            expect(updateClerkUserName).toHaveBeenCalledWith(user.id, 'Jane', 'Smith')

            // DB should still have original values (Clerk failed first)
            const dbUser = await db
                .selectFrom('user')
                .select(['firstName', 'lastName'])
                .where('id', '=', user.id)
                .executeTakeFirstOrThrow()

            expect(dbUser.firstName).toBe(originalFirstName)
            expect(dbUser.lastName).toBe(originalLastName)
            expect(result).toHaveProperty('error')
        })

        it('should update DB after Clerk succeeds', async () => {
            const { user } = await mockSessionWithTestData()

            vi.mocked(updateClerkUserName).mockResolvedValueOnce(undefined)
            vi.mocked(updateClerkUserMetadata).mockResolvedValueOnce({} as never)

            const result = await updatePersonalInfoAction({ firstName: 'Jane', lastName: 'Smith' })

            // Clerk functions were called in order
            expect(updateClerkUserName).toHaveBeenCalledWith(user.id, 'Jane', 'Smith')
            expect(updateClerkUserMetadata).toHaveBeenCalledWith(user.id)

            // DB was updated
            const dbUser = await db
                .selectFrom('user')
                .select(['firstName', 'lastName'])
                .where('id', '=', user.id)
                .executeTakeFirstOrThrow()

            expect(dbUser.firstName).toBe('Jane')
            expect(dbUser.lastName).toBe('Smith')
            expect(result).toEqual({ success: true })
        })
    })
})
