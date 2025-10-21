import logger from '@/lib/logger'
import { onStudyApproved } from '@/server/events'
import {
    db,
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { latestJobForStudy } from '../db/queries'
import {
    approveStudyProposalAction,
    doesTestImageExistForStudyAction,
    fetchStudiesForOrgAction,
    getStudyAction,
} from './study.actions'

vi.mock('@/server/events', () => ({
    onStudyApproved: vi.fn(),
}))

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })
        expect(onStudyApproved).toHaveBeenCalledWith({ studyId: study.id, userId: user.id })
        const job = await latestJobForStudy(study.id)

        expect(job.statusChanges.find((sc) => sc.status == 'JOB-READY')).toBeTruthy()
    })

    it('successfully approves a python language study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        await db
            .insertInto('orgBaseImage')
            .values({
                name: 'Python Base',
                language: 'PYTHON',
                cmdLine: 'python %f',
                url: 'test/url',
                isTesting: true,
                orgId: org.id,
            })
            .execute()

        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            language: 'PYTHON',
        })

        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })

        const job = await latestJobForStudy(study.id)

        expect(job.statusChanges.find((sc) => sc.status == 'JOB-READY')).toBeTruthy()
    })

    it('does not approve a study proposal twice', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })

        // Attempt to approve the same study twice in parallel
        await Promise.all([
            approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug }),
            approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug }),
        ])

        // Check that onStudyApproved was only called once
        expect(onStudyApproved).toHaveBeenCalledOnce()
    })

    it('getStudyAction returns any study that belongs to an org that user is a member of', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(getStudyAction({ studyId })).resolves.toMatchObject({
            id: studyId,
        })
    })

    it('getStudyAction throws for a user in a different org', async () => {
        const { org } = await mockSessionWithTestData()
        const { studyId } = await insertTestStudyData({ org })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })
        mockClerkSession({
            clerkUserId: otherUser.clerkId,
            orgSlug: otherOrg.slug,
            userId: otherUser.id,
            orgId: otherOrg.id,
        })
        // was inserted in beforeEach, should return error
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const result = await getStudyAction({ studyId })
        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cannot view Study'))
    })

    describe('doesTestImageExistForStudyAction', () => {
        it('returns true when a test image exists for the study language and org', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })
            await db
                .insertInto('orgBaseImage')
                .values({
                    name: 'Test R Image',
                    language: 'R',
                    cmdLine: 'Rscript %f',
                    url: 'test/url',
                    isTesting: true,
                    orgId: org.id,
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(true)
        })

        it('returns false when no test image exists for the study org', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
        })

        it('returns false when only non-test images exist', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org, studyStatus: 'PENDING-REVIEW' })
            await db
                .insertInto('orgBaseImage')
                .values({
                    name: 'Non-Test R Image',
                    language: 'R',
                    cmdLine: 'Rscript %f',
                    url: 'test/url',
                    isTesting: false,
                    orgId: org.id,
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
        })

        it('returns false for a test image in a different org', async () => {
            const { org: studyOrg } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { study } = await insertTestStudyJobData({ org: studyOrg, studyStatus: 'PENDING-REVIEW' })

            const otherOrg = await insertTestOrg()
            await db
                .insertInto('orgBaseImage')
                .values({
                    name: 'Other Org Test Image',
                    language: 'R',
                    cmdLine: 'Rscript %f',
                    url: 'test/url',
                    isTesting: true,
                    orgId: otherOrg.id,
                })
                .execute()

            const result = await doesTestImageExistForStudyAction({ studyId: study.id })

            expect(result).toBe(false)
        })
    })

    it('fetchStudiesForOrgAction requires user to be a researcher', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })

        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(fetchStudiesForOrgAction({ orgSlug: org.slug })).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, orgSlug: otherOrg.slug, userId: otherUser.id })
        await expect(fetchStudiesForOrgAction({ orgSlug: org.slug })).resolves.toMatchObject({
            error: expect.objectContaining({ permission_denied: expect.any(String) }),
        })
    })
})
