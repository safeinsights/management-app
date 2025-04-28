import { describe, expect, it, vi } from 'vitest'
import {
    insertTestMember,
    insertTestStudyData,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { approveStudyProposalAction, fetchStudiesForCurrentResearcherAction, getStudyAction } from './study.actions'
import { triggerBuildImageForJob } from '@/server/aws'
import { sendStudyProposalApprovedEmail } from '@/server/mailgun'
import { latestJobForStudy } from '../db/queries'

vi.mock('@/server/aws', () => ({
    triggerBuildImageForJob: vi.fn(),
}))

vi.mock('@/server/mailgun', () => ({
    sendStudyProposalApprovedEmail: vi.fn(),
}))

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, member } = await mockSessionWithTestData()

        const { study } = await insertTestStudyJobData({ member, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
        await approveStudyProposalAction(study.id)
        const job = await latestJobForStudy(study.id, { orgSlug: member.slug, userId: user.id })
        expect(job.latestStatus).toBe('CODE-APPROVED')
        expect(sendStudyProposalApprovedEmail).toHaveBeenCalled()

        expect(triggerBuildImageForJob).toHaveBeenCalledWith(
            expect.objectContaining({ studyId: study.id, studyJobId: job.id }),
        )
    })

    it('getStudyAction returns any study that belongs to an org that user is a member of', async () => {
        const { user, member } = await mockSessionWithTestData()
        const otherMember = await insertTestMember()
        const otherUser = await insertTestUser({ member: otherMember })

        const { studyId } = await insertTestStudyData({ member, researcherId: user.id })

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
        const otherUser = await insertTestUser({ member: otherMember })

        const { studyId } = await insertTestStudyData({ member, researcherId: user.id })

        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, org_slug: otherMember.slug })
        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toHaveLength(0)
    })
})
