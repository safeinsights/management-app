import { describe, expect, test, vi } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { loadStudyJobAction } from './study-job.actions'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
}))

describe('Study Job Actions', () => {
    test('loadStudyJobAction', async () => {
        const { org } = await mockSessionWithTestData()
        const { job, study } = await insertTestStudyJobData({ org })
        const jobInfo = await loadStudyJobAction(job.id)

        expect(jobInfo).toMatchObject({
            studyJobId: job.id,
            studyId: study.id,
            createdAt: expect.any(Date),
            studyTitle: expect.any(String),
            orgSlug: expect.any(String),
        })
    })
})
