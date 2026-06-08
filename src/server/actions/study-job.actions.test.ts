import { describe, expect, test, vi } from 'vitest'
import { db, insertTestStudyJobData, mockSessionWithTestData, actionResult } from '@/tests/unit.helpers'
import {
    approveStudyJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
    rejectStudyJobFilesAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
    fetchFileContents: vi.fn(() => new Blob()),
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

    test('fetchEncryptedJobFilesAction returns only files the requesting user has a key box for', async () => {
        // Enclave session users are seeded with fingerprint 'testFingerprint1'.
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org })

        const file = await db
            .insertInto('studyJobFile')
            .values({
                path: 'results/encrypted/test.csv',
                name: 'test.csv',
                studyJobId: job.id,
                fileType: 'ENCRYPTED-CODE-RUN-LOG',
                iv: 'aXY=',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await db
            .insertInto('studyJobFileKey')
            .values({ studyJobFileId: file.id, fingerprint: 'testFingerprint1', crypt: 'wrapped-key' })
            .executeTakeFirstOrThrow()

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))

        expect(result).toHaveLength(1)
        expect(result[0].fileType).toBe('ENCRYPTED-CODE-RUN-LOG')
        expect(result[0].crypt).toBe('wrapped-key')
        expect(result[0].iv).toBe('aXY=')
        expect(result[0].studyJobFileId).toBe(file.id)
    })

    test('fetchEncryptedJobFilesAction omits files the user has no box for', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org })

        await db
            .insertInto('studyJobFile')
            .values({
                path: 'results/encrypted/secret.csv',
                name: 'secret.csv',
                studyJobId: job.id,
                fileType: 'ENCRYPTED-RESULT',
                iv: 'aXY=',
            })
            .executeTakeFirstOrThrow()

        // No study_job_file_key row for this user → nothing they can decrypt.
        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))
        expect(result).toHaveLength(0)
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
                sharedFiles: [],
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
})
