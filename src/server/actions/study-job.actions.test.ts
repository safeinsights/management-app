import { describe, expect, test, vi } from 'vitest'
import { db, insertTestStudyJobData, mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    fetchApprovedJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
    rejectStudyJobFilesAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
    fetchFileContents: vi.fn(() => new Blob()),
}))

vi.mock('si-encryption/job-results/reader', () => ({
    ResultsReader: class {
        async listFiles() {
            return [{ path: 'test.csv', bytes: 0 }]
        }
    },
}))

vi.mock('@/server/mailer', () => ({
    sendStudyResultsRejectedEmail: vi.fn(),
}))

describe('Study Job Actions', () => {
    test('loadStudyJobAction', async () => {
        const { org } = await mockSessionWithTestData()
        const { job, study } = await insertTestStudyJobData({ org })

        const result = actionResult(await loadStudyJobAction({ studyJobId: job.id }))

        expect(result).toMatchObject({
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

        await db
            .insertInto('studyJobFile')
            .values({ path: 'bad/path', name: 'test.csv', studyJobId: job.id, fileType: 'APPROVED-CODE-RUN-LOG' })
            .executeTakeFirstOrThrow()

        const result = actionResult(await fetchApprovedJobFilesAction({ studyJobId: job.id }))

        expect(result).toHaveLength(1)
        expect(result[0].path).toBe('test.csv')
    })

    test('fetchEncryptedJobFilesAction', async () => {
        const { org } = await mockSessionWithTestData()
        const { job } = await insertTestStudyJobData({ org })
        await db
            .insertInto('studyJobFile')
            .values({ path: 'bad/path', name: 'test.csv', studyJobId: job.id, fileType: 'ENCRYPTED-CODE-RUN-LOG' })
            .executeTakeFirstOrThrow()

        const result = actionResult(
            await fetchEncryptedJobFilesAction({
                jobId: job.id,
            }),
        )

        expect(result).toHaveLength(1)
        expect(result[0].fileType).toBe('ENCRYPTED-CODE-RUN-LOG')
    })

    describe('rejectStudyJobFilesAction', () => {
        test('creates FILES-REJECTED status and sends rejection email', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            await rejectStudyJobFilesAction({
                studyId: study.id,
                studyJobId: job.id,
                orgSlug: org.slug,
            })

            const statusChanges = await db
                .selectFrom('jobStatusChange')
                .select('status')
                .where('studyJobId', '=', job.id)
                .orderBy('createdAt', 'desc')
                .execute()

            expect(statusChanges.find((sc) => sc.status === 'FILES-REJECTED')).toBeTruthy()
            expect(sendStudyResultsRejectedEmail).toHaveBeenCalledWith(study.id)
        })

        test('permission denied for non-enclave user', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            const result = await rejectStudyJobFilesAction({
                studyId: study.id,
                studyJobId: job.id,
                orgSlug: org.slug,
            })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })
    })
})
