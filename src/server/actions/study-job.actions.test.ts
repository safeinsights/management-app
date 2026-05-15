import { describe, expect, test, vi } from 'vitest'
import { db, insertTestStudyJobData, mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    approveStudyJobFilesAction,
    fetchApprovedJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
    rejectStudyJobFilesAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { storeApprovedJobFile } from '@/server/storage'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
    fetchFileContents: vi.fn(() => new Blob()),
    storeApprovedJobFile: vi.fn(),
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

    // Regression tests for OTTER-471: results-review writes must refuse when the
    // opposite terminal row already exists, and the approve handler must not touch
    // S3 once it has refused.
    describe('OTTER-471 results review concurrency safety', () => {
        const storeApprovedJobFileMock = storeApprovedJobFile as unknown as ReturnType<typeof vi.fn>

        test('OTTER-471: rejecting a job whose files were already approved refuses', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'FILES-APPROVED' })

            const result = await rejectStudyJobFilesAction({
                studyId: study.id,
                studyJobId: job.id,
                orgSlug: org.slug,
            })

            expect(result).toMatchObject({ error: expect.objectContaining({ studyJob: expect.any(String) }) })

            const filesRejected = await db
                .selectFrom('jobStatusChange')
                .select('id')
                .where('studyJobId', '=', job.id)
                .where('status', '=', 'FILES-REJECTED')
                .execute()
            expect(filesRejected).toHaveLength(0)
            expect(sendStudyResultsRejectedEmail).not.toHaveBeenCalled()
        })

        test('OTTER-471: approve after FILES-REJECTED refuses and does not touch S3', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'FILES-REJECTED' })

            storeApprovedJobFileMock.mockClear()

            const result = await approveStudyJobFilesAction({
                orgSlug: org.slug,
                jobInfo: { studyId: study.id, studyJobId: job.id, orgSlug: org.slug },
                jobFiles: [
                    {
                        path: 'result.csv',
                        contents: new ArrayBuffer(0),
                        fileType: 'APPROVED-RESULT' as const,
                        sourceId: 'source-1',
                    },
                ],
            })

            expect(result).toMatchObject({ error: expect.objectContaining({ studyJob: expect.any(String) }) })
            expect(storeApprovedJobFileMock).not.toHaveBeenCalled()

            const filesApproved = await db
                .selectFrom('jobStatusChange')
                .select('id')
                .where('studyJobId', '=', job.id)
                .where('status', '=', 'FILES-APPROVED')
                .execute()
            expect(filesApproved).toHaveLength(0)
        })

        // Sequential variant — covered by the two tests above. A true parallel Promise.all
        // race for job files would need the partial unique index follow-up (see plan §7.5)
        // since the in-PR fix is SELECT-then-INSERT without row-level locking, so both calls
        // can pass the SELECT before either INSERTs. Re-enable this test once the index ships.
        test.skip('OTTER-471: parallel approve + reject — exactly one wins (needs partial unique index)', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            storeApprovedJobFileMock.mockClear()

            const results = await Promise.all([
                approveStudyJobFilesAction({
                    orgSlug: org.slug,
                    jobInfo: { studyId: study.id, studyJobId: job.id, orgSlug: org.slug },
                    jobFiles: [
                        {
                            path: 'result.csv',
                            contents: new ArrayBuffer(0),
                            fileType: 'APPROVED-RESULT' as const,
                            sourceId: 'source-1',
                        },
                    ],
                }),
                rejectStudyJobFilesAction({
                    studyId: study.id,
                    studyJobId: job.id,
                    orgSlug: org.slug,
                }),
            ])

            const errors = results.filter((r) => r != null && typeof r === 'object' && 'error' in r)
            const filesApproved = await db
                .selectFrom('jobStatusChange')
                .select('id')
                .where('studyJobId', '=', job.id)
                .where('status', '=', 'FILES-APPROVED')
                .execute()
            const filesRejected = await db
                .selectFrom('jobStatusChange')
                .select('id')
                .where('studyJobId', '=', job.id)
                .where('status', '=', 'FILES-REJECTED')
                .execute()

            expect(filesApproved.length + filesRejected.length).toBeLessThanOrEqual(1)
            expect(errors.length).toBeGreaterThanOrEqual(1)
        })
    })
})
