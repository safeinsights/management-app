import { describe, expect, test, vi } from 'vitest'
import { insertTestJobKeyData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { loadStudyJobAction } from './study-job.actions'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
}))

describe('Study Job Actions', () => {
    test('loadStudyJobAction', async () => {
        const { member } = await mockSessionWithTestData()
        const { job, study } = await insertTestJobKeyData({ memberId: member.id })
        const { jobInfo } = await loadStudyJobAction(job.id)

        expect(jobInfo).toMatchObject({
            studyJobId: job.id,
            studyId: study.id,
            createdAt: expect.any(Date),
            studyTitle: expect.any(String),
            memberSlug: expect.any(String),
        })
    })
})
