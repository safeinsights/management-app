import { describe, expect, it, vi } from 'vitest'
import {
    insertTestMember,
    insertTestStudyData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { approveStudyProposalAction, fetchStudiesForCurrentResearcherAction, getStudyAction } from './study.actions'
import { jobStatusForJobAction } from './study-job.actions'
import { triggerBuildImageForJob } from '@/server/aws'

vi.mock('@/server/aws', () => ({
    triggerBuildImageForJob: vi.fn(),
}))

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, member } = await mockSessionWithTestData()
        const {
            studyId,
            jobIds: [jobId],
        } = await insertTestStudyData({ memberId: member.id, researcherId: user.id })
        await approveStudyProposalAction(studyId)
        const status = await jobStatusForJobAction(jobId)
        expect(status).toBe('CODE-APPROVED')
        expect(triggerBuildImageForJob).toHaveBeenCalledWith(expect.objectContaining({ studyJobId: jobId }))
    })

    it('getStudyAction returns any study that belongs to an org that user is a member of', async () => {
        const { user, member } = await mockSessionWithTestData()
        const otherMember = await insertTestMember()
        const otherUser = await insertTestUser({ memberId: otherMember.id })

        const { studyId } = await insertTestStudyData({ memberId: member.id, researcherId: user.id })

        await expect(getStudyAction(studyId)).resolves.toMatchObject({
            id: studyId,
        })

        mockClerkSession({ clerkUserId: otherUser.clerkId, org_slug: otherMember.slug })
        await expect(getStudyAction(studyId)).resolves.toBeUndefined()
    })

    it('fetchStudiesForCurrentResearcherAction requires user to be a researcher', async () => {
        const { user, member } = await mockSessionWithTestData()
        expect(user.isResearcher).toBeTruthy()
        const otherMember = await insertTestMember()
        const otherUser = await insertTestUser({ memberId: otherMember.id })

        const { studyId } = await insertTestStudyData({ memberId: member.id, researcherId: user.id })

        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, org_slug: otherMember.slug })
        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toHaveLength(0)
    })
})
