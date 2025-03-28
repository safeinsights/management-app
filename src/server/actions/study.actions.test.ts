import { describe, expect, it, vi, beforeEach } from 'vitest'
import { insertTestStudyData, mockClerkSession, mockApiMember } from '@/tests/unit.helpers'

import { approveStudyProposalAction } from './study.actions'

import { jobStatusForJobAction } from './study-job.actions'
import { triggerBuildImageForJob } from '@/server/aws'

vi.mock('@/server/config', () => ({
    USING_S3_STORAGE: true,
}))
vi.mock('@/server/aws', () => ({
    triggerBuildImageForJob: vi.fn(),
}))

describe('Study Actions', () => {
    beforeEach(() => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: 'testy-mctestface',
        })
    })

    it('successfully approves a study proposal', async () => {
        const member = await mockApiMember({ identifier: 'testy-mctestface' })
        const {
            studyId,
            jobIds: [jobId],
        } = await insertTestStudyData({ memberId: member.id })
        await approveStudyProposalAction(studyId)
        const status = await jobStatusForJobAction(jobId)
        expect(status).toBe('CODE-APPROVED')
        expect(triggerBuildImageForJob).toHaveBeenCalledWith(expect.objectContaining({ studyJobId: jobId }))
    })
})
