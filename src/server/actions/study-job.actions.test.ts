import { describe, expect, test, vi, type Mock } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import {
    actionResult,
    buildFeedback,
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    createTestProposalDraft,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS, ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import {
    approveStudyJobFilesAction,
    fetchEncryptedJobFilesAction,
    fetchStudyJobCodeFileAction,
    loadStudyJobAction,
    regenerateStudyReviewAction,
    rejectStudyJobFilesAction,
    submitOutputsDecisionAction,
} from './study-job.actions'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { onStudyReviewRequested } from '@/server/events'
import { fetchStudiesForOrgAction } from './study.actions'
import { dashboardRawStateFromRow } from '@/components/dashboard/studies-table/dashboard-raw-state'
import type { StudyRow } from '@/components/dashboard/studies-table/types'
import { projectStudyState, resolvePillStatus } from '@/lib/study-screen'
import logger from '@/lib/logger'

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

async function setupResultApprovalFixture({ jobStatus = 'RUN-COMPLETE' as StudyJobStatus } = {}) {
    const { user: reviewer, org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
    const lab = await insertTestOrg({ slug: 'otter-635-lab', type: 'lab' })
    const { user: researcher } = await insertTestUser({ org: lab })
    const fingerprint = 'otter-635-researcher-key'

    await db
        .insertInto('userPublicKey')
        .values({ userId: researcher.id, publicKey: Buffer.from('labPublicKey'), fingerprint })
        .executeTakeFirstOrThrow()

    const { job, study } = await insertTestStudyJobData({
        org: enclave,
        researcherId: researcher.id,
        jobStatus,
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
                keys: [{ fingerprint, crypt: 'wrapped-for-researcher' }],
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

    // OTTER-675: the DP's single decision on decrypted outputs. Feedback and the files status are
    // written together, so each test asserts both halves.
    describe('submitOutputsDecisionAction', () => {
        const jobStatuses = (jobId: string) =>
            db.selectFrom('jobStatusChange').select('status').where('studyJobId', '=', jobId).execute()

        const resultsComment = (studyId: string) =>
            db
                .selectFrom('studyReviewComment')
                .selectAll('studyReviewComment')
                .where('studyId', '=', studyId)
                .where('reviewKind', '=', 'RESULTS')
                .executeTakeFirst()

        test('sharing the outputs approves the files, records the keys and stores the feedback', async () => {
            const { enclave, file, job, reviewer, sharedFiles, study } = await setupResultApprovalFixture()

            actionResult(
                await submitOutputsDecisionAction({
                    orgSlug: enclave.slug,
                    studyJobId: job.id,
                    decision: 'share-outputs',
                    feedback: 'The outputs look clean and contain no PII.',
                    sharedFiles,
                }),
            )

            expect((await jobStatuses(job.id)).map((s) => s.status)).toContain('FILES-APPROVED')

            const comment = await resultsComment(study.id)
            expect(comment).toMatchObject({
                decision: 'APPROVE',
                entryType: 'DECISION',
                studyJobId: job.id,
                authorId: reviewer.id,
            })
            expect(JSON.stringify(comment!.body)).toContain('The outputs look clean and contain no PII.')

            const keys = await db
                .selectFrom('studyJobFileRecipientKey')
                .selectAll('studyJobFileRecipientKey')
                .where('studyJobFileId', '=', file.id)
                .execute()
            expect(keys).toHaveLength(1)
        })

        test('sharing feedback only rejects the files and shares no keys', async () => {
            const { enclave, file, job, study } = await setupResultApprovalFixture()

            actionResult(
                await submitOutputsDecisionAction({
                    orgSlug: enclave.slug,
                    studyJobId: job.id,
                    decision: 'share-feedback-only',
                    feedback: 'The log leaks a participant identifier, please remove it.',
                    sharedFiles: [],
                }),
            )

            expect((await jobStatuses(job.id)).map((s) => s.status)).toContain('FILES-REJECTED')
            expect(await resultsComment(study.id)).toMatchObject({ decision: 'NEEDS-CLARIFICATION' })

            const keys = await db
                .selectFrom('studyJobFileRecipientKey')
                .selectAll('studyJobFileRecipientKey')
                .where('studyJobFileId', '=', file.id)
                .execute()
            expect(keys).toHaveLength(0)
        })

        test('rejects empty feedback without touching the job status', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-outputs',
                feedback: '   ',
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-APPROVED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        // The cap is derived from the job's own status, never from the request, so a caller cannot
        // raise its own limit. These two tests are the pair that proves it: the same word count is
        // rejected for an errored run and accepted for a completed one.
        test('applies the 300-word errored cap regardless of what the caller asks for', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture({ jobStatus: 'JOB-ERRORED' })

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: buildFeedback(ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS + 1),
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-REJECTED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        test('allows the same length on a completed run, which carries the higher cap', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture()

            actionResult(
                await submitOutputsDecisionAction({
                    orgSlug: enclave.slug,
                    studyJobId: job.id,
                    decision: 'share-feedback-only',
                    feedback: buildFeedback(ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS + 1),
                    sharedFiles: [],
                }),
            )

            expect((await jobStatuses(job.id)).map((s) => s.status)).toContain('FILES-REJECTED')
            expect(await resultsComment(study.id)).toBeDefined()
        })

        test('rejects feedback over the completed cap', async () => {
            const { enclave, job } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: buildFeedback(COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS + 1),
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-REJECTED')
        })

        // The study is derived from the job, so naming a job in an org the caller cannot review is
        // refused. Trusting a caller-supplied studyId alongside the job id would let a reviewer
        // authorized for their own study finalize someone else's.
        test('permission denied when the job belongs to another org', async () => {
            const { job } = await setupResultApprovalFixture()
            const { org: otherEnclave } = await mockSessionWithTestData({ orgType: 'enclave' })

            const result = await submitOutputsDecisionAction({
                orgSlug: otherEnclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: 'Not my study.',
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-REJECTED')
        })

        // UI routing is not a server-side invariant: a direct caller must not be able to finalize a
        // job that never produced outputs.
        test('refuses a job that has not reached a terminal result', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture({ jobStatus: 'JOB-RUNNING' })

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: 'Too early to decide.',
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ study: expect.stringContaining('no outputs') }) })
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        // Approving is a promise that the lab gets the files, so a request carrying no re-wrapped
        // keys must not be able to record FILES-APPROVED.
        test('refuses to approve while sharing no files', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-outputs',
                feedback: 'Looks fine.',
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ files: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-APPROVED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        // The (studyJobId, reviewKind, round) unique constraint is the race-loser guard; the
        // second reviewer must get a readable message, not a raw duplicate-key error.
        test('refuses a second decision on the same outputs', async () => {
            const { enclave, job, sharedFiles } = await setupResultApprovalFixture()
            const params = {
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-outputs' as const,
                feedback: 'Looks good to share.',
                sharedFiles,
            }

            actionResult(await submitOutputsDecisionAction(params))
            const second = await submitOutputsDecisionAction(params)

            expect(second).toEqual({ error: expect.objectContaining({ study: expect.stringContaining('already') }) })
        })

        test('clears the collaborative feedback draft once submitted', async () => {
            const { enclave, job, study, sharedFiles } = await setupResultApprovalFixture()
            const docName = outputsReviewFeedbackDocName(job.id)
            await db
                .insertInto('yjsDocument')
                .values({ name: docName, studyId: study.id, data: Buffer.from('draft-state') })
                .execute()

            actionResult(
                await submitOutputsDecisionAction({
                    orgSlug: enclave.slug,
                    studyJobId: job.id,
                    decision: 'share-outputs',
                    feedback: 'Ready to share.',
                    sharedFiles,
                }),
            )

            const draft = await db
                .selectFrom('yjsDocument')
                .select('name')
                .where('name', '=', docName)
                .executeTakeFirst()
            expect(draft).toBeUndefined()
        })

        test('permission denied for a lab user', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { job } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })

            const result = await submitOutputsDecisionAction({
                orgSlug: org.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: 'Not allowed.',
                sharedFiles: [],
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

describe('draft code files are private to the Research Lab (OTTER-596)', () => {
    // Attach a code file to the draft's own studyJob so there is something to fetch.
    const seedCodeFile = async (studyId: string) => {
        const job = await db.insertInto('studyJob').values({ studyId }).returning('id').executeTakeFirstOrThrow()
        await db
            .insertInto('studyJobFile')
            .values({ studyJobId: job.id, name: 'main.r', path: `code/${studyId}/main.r`, fileType: 'MAIN-CODE' })
            .execute()
        return job.id
    }

    test('data-org member cannot fetch a code file for an unsubmitted draft', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-code-draft-enclave' })
        const studyJobId = await seedCodeFile(studyId)

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const result = await fetchStudyJobCodeFileAction({ studyJobId, fileName: 'main.r' })
        expect(result).toMatchObject({
            error: expect.objectContaining({ permission_denied: expect.any(String) }),
        })
    })

    test('data-org member can fetch a code file once the study is submitted', async () => {
        const { enclave, studyId } = await createTestProposalDraft({ enclaveSlug: 'otter596-code-submitted-enclave' })
        const studyJobId = await seedCodeFile(studyId)
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')

        await mockSessionWithTestData({ orgSlug: enclave.slug, orgType: 'enclave' })
        const result = actionResult(await fetchStudyJobCodeFileAction({ studyJobId, fileName: 'main.r' }))
        expect(result).toMatchObject({ fileName: 'main.r' })
    })
})
