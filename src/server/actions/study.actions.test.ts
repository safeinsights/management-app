import { describe, expect, it, vi } from 'vitest'
import {
    insertTestOrg,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { approveStudyProposalAction, fetchStudiesForCurrentResearcherAction, getStudyAction } from './study.actions'
import { latestJobForStudy } from '../db/queries'
import { onStudyApproved } from '@/server/events'
import logger from '@/lib/logger'

vi.mock('@/server/events', () => ({
    onStudyApproved: vi.fn(),
}))

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ isReviewer: true })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })
        expect(onStudyApproved).toHaveBeenCalledWith({ studyId: study.id, userId: user.id })
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
        // was inserted in beforeEach, should throw on dupe insert
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        await expect(getStudyAction({ studyId })).rejects.toThrow()
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cannot view Study'))
    })

    it('fetchStudiesForCurrentResearcherAction requires user to be a researcher', async () => {
        const { user, org } = await mockSessionWithTestData({ isReviewer: true })

        const otherOrg = await insertTestOrg()
        const { user: otherUser } = await insertTestUser({ org: otherOrg })

        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, orgSlug: otherOrg.slug, userId: otherUser.id })
        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toHaveLength(0)
    })
})
