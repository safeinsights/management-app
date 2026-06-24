import { describe, expect, test, vi, type Mock } from 'vitest'
import { db, insertTestStudyJobData, mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    approveStudyJobFilesAction,
    fetchApprovedJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
    regenerateStudyReviewAction,
    rejectStudyJobFilesAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { onStudyReviewRequested } from '@/server/events'

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

// Spy on the generation trigger so the retry test asserts re-fire without
// running the real deferred review pipeline. Keep the rest of the module
// (deferred, other handlers) real — study-request.ts depends on them.
vi.mock('@/server/events', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/events')>()),
    onStudyReviewRequested: vi.fn(),
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
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
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

            const updatedStudy = await db
                .selectFrom('study')
                .select('reviewerId')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.reviewerId).toBe(user.id)
        })

        test('approveStudyJobFilesAction creates FILES-APPROVED status and stamps reviewerId', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            await approveStudyJobFilesAction({
                orgSlug: org.slug,
                jobInfo: { studyId: study.id, studyJobId: job.id, orgSlug: org.slug },
                jobFiles: [],
            })

            const statusChanges = await db
                .selectFrom('jobStatusChange')
                .select('status')
                .where('studyJobId', '=', job.id)
                .execute()
            expect(statusChanges.find((sc) => sc.status === 'FILES-APPROVED')).toBeTruthy()

            const updatedStudy = await db
                .selectFrom('study')
                .select('reviewerId')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.reviewerId).toBe(user.id)
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

    describe('regenerateStudyReviewAction', () => {
        test('clears a failed review row and re-fires generation', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job } = await insertTestStudyJobData({ org, jobStatus: 'CODE-SUBMITTED' })
            await db
                .insertInto('studyReview')
                .values({ studyJobId: job.id, report: null, summaryFailedAt: new Date() })
                .execute()

            actionResult(await regenerateStudyReviewAction({ studyJobId: job.id }))

            const remaining = await db
                .selectFrom('studyReview')
                .select('id')
                .where('studyJobId', '=', job.id)
                .executeTakeFirst()
            expect(remaining).toBeUndefined()
            expect(onStudyReviewRequested as unknown as Mock).toHaveBeenCalledWith({ studyJobId: job.id })
        })

        test('leaves a successful review row untouched', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job } = await insertTestStudyJobData({ org, jobStatus: 'CODE-SUBMITTED' })
            await db
                .insertInto('studyReview')
                .values({ studyJobId: job.id, report: JSON.stringify({ codeExplanation: 'ok' }) })
                .execute()

            actionResult(await regenerateStudyReviewAction({ studyJobId: job.id }))

            // A successful review must survive a stray retry — only failed rows clear.
            const remaining = await db
                .selectFrom('studyReview')
                .select('id')
                .where('studyJobId', '=', job.id)
                .executeTakeFirst()
            expect(remaining).toBeDefined()
        })
    })
})
