import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/database'
import { mockSessionWithTestData } from '@/tests/unit.helpers'
import { updatePersonalInfoAction } from './researcher-profile.actions'
import { updateClerkUserName } from '@/server/clerk'

// Module-level mock required: using mockClerkSession to mock clerkClient causes timeouts
// due to async interactions with the Action middleware. Mocking the wrapper directly works.
vi.mock('@/server/clerk', () => ({
    updateClerkUserName: vi.fn(),
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

            const result = await updatePersonalInfoAction({ firstName: 'Jane', lastName: 'Smith' })

            // Clerk function was called
            expect(updateClerkUserName).toHaveBeenCalledWith(user.id, 'Jane', 'Smith')

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
