import { describe, expect, it, vi } from 'vitest'
import { insertTestStudyData, mockSessionWithTestData } from '@/tests/unit.helpers'
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
})
