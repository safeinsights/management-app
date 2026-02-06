import { describe, it, expect, vi } from 'vitest'
import { db } from '@/database'
import { isActionError } from '@/lib/errors'
import {
    mockSessionWithTestData,
    insertTestStudyJobData,
    insertTestResearcherProfile,
    faker,
} from '@/tests/unit.helpers'
import { updatePersonalInfoAction, getResearcherProfileByUserIdAction } from './researcher-profile.actions'
import { updateClerkUserName } from '@/server/clerk'

describe('researcher-profile.actions', () => {
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

    describe('getResearcherProfileByUserIdAction', () => {
        it('returns user, profile, and positions data for valid userId', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            await insertTestResearcherProfile({
                userId: user.id,
                education: { institution: 'MIT', degree: 'Ph.D.', fieldOfStudy: 'CS' },
                positions: [{ affiliation: 'MIT', position: 'Professor' }],
                researchDetails: { interests: ['AI', 'ML'] },
            })

            const result = await getResearcherProfileByUserIdAction({ userId: user.id, studyId: study.id })

            expect(result).not.toBeNull()
            expect(isActionError(result)).toBe(false)
            expect(result).toMatchObject({
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
                profile: {
                    userId: user.id,
                    educationDegree: 'Ph.D.',
                    researchInterests: ['AI', 'ML'],
                },
                positions: [
                    expect.objectContaining({
                        affiliation: 'MIT',
                        position: 'Professor',
                    }),
                ],
            })
        })

        it('returns null when user does not exist', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const result = await getResearcherProfileByUserIdAction({
                userId: faker.string.uuid(),
                studyId: study.id,
            })

            expect(result).toBeNull()
        })

        it('returns null when profile does not exist', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const result = await getResearcherProfileByUserIdAction({ userId: user.id, studyId: study.id })

            expect(result).toBeNull()
        })
    })
})
