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

vi.mock('@/server/events', () => ({
    onStudyApproved: vi.fn(),
}))

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, org } = await mockSessionWithTestData({ isReviewer: true })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })
        expect(onStudyApproved).toHaveBeenCalledWith({ studyId: study.id, userId: user.id })
        const job = await latestJobForStudy(study.id, { orgSlug: org.slug, userId: user.id })

        expect(job.statusChanges.find((sc) => sc.status == 'JOB-READY')).toBeTruthy()
    })

    it('getStudyAction returns any study that belongs to an org that user is a member of', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(getStudyAction(studyId)).resolves.toMatchObject({
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

        await expect(getStudyAction(studyId)).rejects.toThrow()
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
