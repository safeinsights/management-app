import { describe, expect, it } from 'vitest'
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
import { sendStudyProposalApprovedEmail } from '@/server/mailgun'

describe('Study Actions', () => {
    it('successfully approves a study proposal', async () => {
        const { user, org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'PENDING-REVIEW' })
        await approveStudyProposalAction({ studyId: study.id, orgSlug: org.slug })
        expect(sendStudyProposalApprovedEmail).toHaveBeenCalled()
        const job = await latestJobForStudy(study.id, { orgSlug: org.slug, userId: user.id })
        expect(job.latestStatus).toBe('JOB-READY')
    })

    it('getStudyAction returns any study that belongs to an org that user is a org of', async () => {
        const { user, org } = await mockSessionWithTestData()
        const otherOrg = await insertTestOrg()
        const otherUser = await insertTestUser({ org: otherOrg })

        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(getStudyAction(studyId)).resolves.toMatchObject({
            id: studyId,
        })

        mockClerkSession({ clerkUserId: otherUser.clerkId, org_slug: otherOrg.slug })
        await expect(getStudyAction(studyId)).resolves.toBeUndefined()
    })

    it('fetchStudiesForCurrentResearcherAction requires user to be a researcher', async () => {
        const { user, org } = await mockSessionWithTestData()

        const otherOrg = await insertTestOrg()
        const otherUser = await insertTestUser({ org: otherOrg })

        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: studyId })]),
        )

        mockClerkSession({ clerkUserId: otherUser.clerkId, org_slug: otherOrg.slug })
        await expect(fetchStudiesForCurrentResearcherAction()).resolves.toHaveLength(0)
    })
})
