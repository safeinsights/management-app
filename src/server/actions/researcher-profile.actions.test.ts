import { describe, it, expect, vi } from 'vitest'
import { db } from '@/database'
import logger from '@/lib/logger'
import { isActionError } from '@/lib/errors'
import {
    mockSessionWithTestData,
    insertTestStudyJobData,
    insertTestResearcherProfile,
    insertTestOrg,
    insertTestUser,
    mockClerkSession,
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

            expect(updateClerkUserName).toHaveBeenCalledWith(user.id, 'Jane', 'Smith')

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

            expect(updateClerkUserName).toHaveBeenCalledWith(user.id, 'Jane', 'Smith')

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

        it('denies an unknown userId instead of confirming the account does not exist', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            const result = await getResearcherProfileByUserIdAction({
                userId: faker.string.uuid(),
                studyId: study.id,
            })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
            // Must not take the throwing branch, or an attacker iterating user ids creates one
            // Sentry issue per guess.
            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('is not associated with study'))
            expect(errorSpy).not.toHaveBeenCalled()
        })

        it('denies a userId that is unrelated to the study', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const otherOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
            const { user: unrelatedUser } = await insertTestUser({ org: otherOrg })
            await insertTestResearcherProfile({
                userId: unrelatedUser.id,
                education: { institution: 'Stanford', degree: 'Ph.D.', fieldOfStudy: 'Physics' },
            })

            vi.spyOn(logger, 'info').mockImplementation(() => undefined)
            const result = await getResearcherProfileByUserIdAction({
                userId: unrelatedUser.id,
                studyId: study.id,
            })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('denies a member of the submitting org who is not named on the study', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const { user: labMate } = await insertTestUser({ org })

            vi.spyOn(logger, 'info').mockImplementation(() => undefined)
            const result = await getResearcherProfileByUserIdAction({ userId: labMate.id, studyId: study.id })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('allows the study principal investigator', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const { user: piUser } = await insertTestUser({ org })
            await db.updateTable('study').set({ piUserId: piUser.id }).where('id', '=', study.id).execute()
            await insertTestResearcherProfile({
                userId: piUser.id,
                education: { institution: 'Rice', degree: 'Ph.D.', fieldOfStudy: 'Statistics' },
            })

            const result = await getResearcherProfileByUserIdAction({ userId: piUser.id, studyId: study.id })

            expect(isActionError(result)).toBe(false)
            expect(result).toMatchObject({
                user: { id: piUser.id, email: piUser.email },
                profile: { educationInstitution: 'Rice' },
            })
        })

        it('returns user with null profile when profile does not exist', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const result = await getResearcherProfileByUserIdAction({ userId: user.id, studyId: study.id })

            expect(result).toMatchObject({
                user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
                profile: null,
                positions: [],
            })
        })

        it('denies access for a user from a different org', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const otherOrg = await insertTestOrg()
            const { user: otherUser } = await insertTestUser({ org: otherOrg })
            mockClerkSession({
                clerkUserId: otherUser.clerkId,
                orgSlug: otherOrg.slug,
                userId: otherUser.id,
                orgId: otherOrg.id,
            })

            vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            const result = await getResearcherProfileByUserIdAction({ userId: user.id, studyId: study.id })
            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })

        it('does not tell a caller without study access whether a userId is named on the study', async () => {
            const { org, user } = await mockSessionWithTestData({ isAdmin: true, orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

            const otherOrg = await insertTestOrg()
            const { user: outsider } = await insertTestUser({ org: otherOrg })
            mockClerkSession({
                clerkUserId: outsider.clerkId,
                orgSlug: otherOrg.slug,
                userId: outsider.id,
                orgId: otherOrg.id,
            })

            vi.spyOn(logger, 'error').mockImplementation(() => undefined)
            // Both guesses must give the same generic denial, or a caller could confirm who a
            // study's researcher or PI is.
            const correctGuess = await getResearcherProfileByUserIdAction({ userId: user.id, studyId: study.id })
            const wrongGuess = await getResearcherProfileByUserIdAction({
                userId: faker.string.uuid(),
                studyId: study.id,
            })

            for (const result of [correctGuess, wrongGuess]) {
                expect(result).toEqual({
                    error: { permission_denied: expect.stringContaining('cannot view Study') },
                })
                expect(JSON.stringify(result)).not.toContain('not associated')
            }
            // The denial echoes the ability args, so it must not carry the study's real ids.
            expect(JSON.stringify(wrongGuess)).not.toContain(user.id)
        })
    })
})
