import { describe, expect, test, vi } from 'vitest'
import { db, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import {
    fetchApprovedJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
} from './study-job.actions'


vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
    fetchFileContents: vi.fn(() => new Blob()),
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

    test('fetchApprovedJobFilesAction', async () => {
        const { org } = await mockSessionWithTestData()
        const { job } = await insertTestStudyJobData({
            org,
            jobStatus: 'FILES-APPROVED',
        })

        db.insertInto('studyJobFile')
        .values({ path: 'bad/path', name: 'test.csv', studyJobId: job.id, fileType: 'APPROVED-LOG' })
        .executeTakeFirstOrThrow()

        const files = await fetchApprovedJobFilesAction(job.id)

        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('test.csv')
    })

    test('fetchEncryptedJobFilesAction', async () => {
        const { org } = await mockSessionWithTestData()
        const { job } = await insertTestStudyJobData({ org })
        db.insertInto('studyJobFile')
        .values({ path: 'bad/path', name: 'test.csv', studyJobId: job.id, fileType: 'ENCRYPTED-LOG' })
        .executeTakeFirstOrThrow()

        const files = await fetchEncryptedJobFilesAction({
            jobId: job.id,
            orgSlug: org.slug,
        })

        expect(files).toHaveLength(1)
        expect(files[0].fileType).toBe('ENCRYPTED-LOG')

    })
})
