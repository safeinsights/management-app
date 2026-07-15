import { describe, expect, test, vi, type Mock } from 'vitest'
import {
    actionResult,
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import {
    approveStudyJobFilesAction,
    fetchEncryptedJobFilesAction,
    loadStudyJobAction,
    regenerateStudyReviewAction,
    rejectStudyJobFilesAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { onStudyReviewRequested } from '@/server/events'
import { fetchStudiesForOrgAction } from './study.actions'
import { dashboardRawStateFromRow } from '@/components/dashboard/studies-table/dashboard-raw-state'
import type { StudyRow } from '@/components/dashboard/studies-table/types'
import { projectStudyState, resolvePillStatus } from '@/lib/study-screen'

vi.mock('@/server/storage', () => ({
    fetchCodeManifest: vi.fn(() => ({})),
    fetchFileContents: vi.fn(() => new Blob()),
}))

vi.mock('@/server/mailer', () => ({
    sendStudyResultsRejectedEmail: vi.fn(),
    sendStudyResultsApprovedEmail: vi.fn(),
}))

// Spy on the generation trigger so the retry test asserts re-fire without
// running the real deferred review pipeline. Keep the rest of the module
// (deferred, other handlers) real — study-request.ts depends on them.
vi.mock('@/server/events', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/events')>()),
    onStudyReviewRequested: vi.fn(),
}))

async function setupResultApprovalFixture({ withResearcherKey = true } = {}) {
    const { user: reviewer, org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
    const lab = await insertTestOrg({ slug: 'otter-635-lab', type: 'lab' })
    const { user: researcher } = await insertTestUser({ org: lab })
    const fingerprint = 'otter-635-researcher-key'

    if (withResearcherKey) {
        await db
            .insertInto('userPublicKey')
            .values({ userId: researcher.id, publicKey: Buffer.from('labPublicKey'), fingerprint })
            .executeTakeFirstOrThrow()
    }

    const { job, study } = await insertTestStudyJobData({
        org: enclave,
        researcherId: researcher.id,
        jobStatus: 'RUN-COMPLETE',
    })
    await db.updateTable('study').set({ submittedByOrgId: lab.id }).where('id', '=', study.id).execute()
    const file = await db
        .insertInto('studyJobFile')
        .values({
            path: 'results/encrypted-results.zip',
            name: 'encrypted-results.zip',
            studyJobId: job.id,
            fileType: 'ENCRYPTED-RESULT',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        enclave,
        file,
        job,
        lab,
        researcher,
        reviewer,
        sharedFiles: [
            {
                studyJobFileId: file.id,
                filePath: 'results.csv',
                keys: withResearcherKey ? [{ fingerprint, crypt: 'wrapped-for-researcher' }] : [],
            },
        ],
        study,
    }
}

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

    test('fetchEncryptedJobFilesAction returns the whole-zip artifacts to an enclave reviewer', async () => {
        // Enclave reviewers are manifest recipients, so they get every artifact with no
        // recipientKeys — they decrypt with their own key.
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org })

        const file = await db
            .insertInto('studyJobFile')
            .values({
                path: 'results/encrypted-results.zip',
                name: 'encrypted-results.zip',
                studyJobId: job.id,
                fileType: 'ENCRYPTED-CODE-RUN-LOG',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))

        expect(result).toHaveLength(1)
        expect(result[0].fileType).toBe('ENCRYPTED-CODE-RUN-LOG')
        expect(result[0].studyJobFileId).toBe(file.id)
        expect(result[0].recipientKeys).toEqual({})
    })

    // Regression: the middleware must expose submittedByOrgId so the CASL 'view StudyJob' rule
    // matches lab researchers, not just enclave reviewers — researchers fetch their re-wrapped
    // result files through this same action.
    test('fetchEncryptedJobFilesAction returns researcher keys for shared files', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { job } = await insertTestStudyJobData({ org })

        // Lab test users are seeded without a key; give this researcher one plus a wrapped key.
        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('labPublicKey'), fingerprint: 'labFingerprint1' })
            .executeTakeFirstOrThrow()

        const file = await db
            .insertInto('studyJobFile')
            .values({
                path: 'results/encrypted-results.zip',
                name: 'encrypted-results.zip',
                studyJobId: job.id,
                fileType: 'ENCRYPTED-RESULT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await db
            .insertInto('studyJobFileRecipientKey')
            .values({
                studyJobFileId: file.id,
                filePath: 'results.csv',
                fingerprint: 'labFingerprint1',
                crypt: 'wrapped-for-researcher',
            })
            .executeTakeFirstOrThrow()

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))

        expect(result).toHaveLength(1)
        expect(result[0].recipientKeys).toEqual({ 'results.csv': 'wrapped-for-researcher' })
    })

    test('fetchEncryptedJobFilesAction returns nothing to a researcher with no shared keys', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { job } = await insertTestStudyJobData({ org })

        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('labPublicKey'), fingerprint: 'labFingerprint1' })
            .executeTakeFirstOrThrow()

        await db
            .insertInto('studyJobFile')
            .values({
                path: 'results/encrypted-results.zip',
                name: 'encrypted-results.zip',
                studyJobId: job.id,
                fileType: 'ENCRYPTED-RESULT',
            })
            .executeTakeFirstOrThrow()

        // No study_job_file_recipient_key row for this researcher → nothing they can decrypt.
        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))
        expect(result).toHaveLength(0)
    })

    describe('result decision actions', () => {
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

        test('OTTER-635: approval makes results ready and accessible to the researcher', async () => {
            const { enclave, file, job, lab, researcher, reviewer, sharedFiles, study } =
                await setupResultApprovalFixture()

            actionResult(
                await approveStudyJobFilesAction({
                    orgSlug: enclave.slug,
                    jobInfo: { studyId: study.id, studyJobId: job.id, orgSlug: enclave.slug },
                    sharedFiles,
                }),
            )

            const updatedStudy = await db
                .selectFrom('study')
                .select('reviewerId')
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updatedStudy.reviewerId).toBe(reviewer.id)

            mockClerkSession({
                clerkUserId: researcher.clerkId,
                orgSlug: lab.slug,
                userId: researcher.id,
                orgId: lab.id,
                orgType: 'lab',
            })
            const studies = actionResult(await fetchStudiesForOrgAction({ orgSlug: lab.slug }))
            const dashboardStudy = studies.find((candidate) => candidate.id === study.id)!
            const state = projectStudyState(dashboardRawStateFromRow(dashboardStudy as StudyRow))
            expect(state.resultsApproved).toBe(true)
            expect(resolvePillStatus('researcher', state)).toMatchObject({ stage: 'Results', label: 'Ready' })

            const files = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id }))
            expect(files).toHaveLength(1)
            expect(files[0]).toMatchObject({
                studyJobFileId: file.id,
                recipientKeys: { 'results.csv': 'wrapped-for-researcher' },
            })
        })

        test('does not approve results when no researcher encryption keys are shared', async () => {
            const { enclave, job, sharedFiles, study } = await setupResultApprovalFixture({
                withResearcherKey: false,
            })

            const result = await approveStudyJobFilesAction({
                orgSlug: enclave.slug,
                jobInfo: { studyId: study.id, studyJobId: job.id, orgSlug: enclave.slug },
                sharedFiles,
            })

            expect(result).toEqual({
                error: { sharedFiles: 'Results cannot be approved without a researcher encryption key.' },
            })
            const approval = await db
                .selectFrom('jobStatusChange')
                .select('id')
                .where('studyJobId', '=', job.id)
                .where('status', '=', 'FILES-APPROVED')
                .executeTakeFirst()
            expect(approval).toBeUndefined()
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
