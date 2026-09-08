import { describe, expect, test, vi, type Mock } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import {
    actionResult,
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockClerkSession,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    createTestProposalDraft,
    setTestStudyStatus,
} from '@/tests/unit.helpers'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
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

// Spy on the generation trigger only; study-request.ts depends on the rest of the module.
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

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'reviewer' }))

        expect(result).toHaveLength(1)
        expect(result[0].fileType).toBe('ENCRYPTED-CODE-RUN-LOG')
        expect(result[0].studyJobFileId).toBe(file.id)
        expect(result[0].recipientKeys).toEqual({})
    })

    test('fetchEncryptedJobFilesAction returns researcher keys for shared files', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { job } = await insertTestStudyJobData({ org })

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

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'researcher' }))

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

        const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'researcher' }))
        expect(result).toHaveLength(0)
    })

    describe('dual-role and stale org claims', () => {
        async function setupDualRoleFixture() {
            const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()

            await db
                .insertInto('userPublicKey')
                .values({
                    userId: user.id,
                    publicKey: Buffer.from('dualRolePublicKey'),
                    fingerprint: 'dualRoleFingerprint',
                })
                .executeTakeFirstOrThrow()

            const { job, study } = await insertTestStudyJobData({ org: enclaveOrg, researcherId: user.id })
            await db.updateTable('study').set({ submittedByOrgId: labOrg.id }).where('id', '=', study.id).execute()

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

            return { enclaveOrg, file, job, labOrg, user }
        }

        test('fetchEncryptedJobFilesAction returns wrapped keys to a dual-role user asking as researcher', async () => {
            const { file, job } = await setupDualRoleFixture()

            await db
                .insertInto('studyJobFileRecipientKey')
                .values({
                    studyJobFileId: file.id,
                    filePath: 'results.csv',
                    fingerprint: 'dualRoleFingerprint',
                    crypt: 'wrapped-for-dual-role',
                })
                .executeTakeFirstOrThrow()

            const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'researcher' }))

            expect(result).toHaveLength(1)
            expect(result[0].recipientKeys).toEqual({ 'results.csv': 'wrapped-for-dual-role' })
        })

        test('fetchEncryptedJobFilesAction returns manifest artifacts to a dual-role user asking as reviewer', async () => {
            const { file, job } = await setupDualRoleFixture()

            const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'reviewer' }))

            expect(result).toHaveLength(1)
            expect(result[0].studyJobFileId).toBe(file.id)
            expect(result[0].recipientKeys).toEqual({})
        })

        test('fetchEncryptedJobFilesAction ignores a stale enclave claim when asked as researcher', async () => {
            const { org: lab, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const enclave = await insertTestOrg({ slug: 'otter-stale-claim-enclave', type: 'enclave' })

            const { job, study } = await insertTestStudyJobData({ org: enclave, researcherId: user.id })
            await db.updateTable('study').set({ submittedByOrgId: lab.id }).where('id', '=', study.id).execute()

            await db
                .insertInto('userPublicKey')
                .values({
                    userId: user.id,
                    publicKey: Buffer.from('labPublicKey'),
                    fingerprint: 'staleClaimFingerprint',
                })
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
                    fingerprint: 'staleClaimFingerprint',
                    crypt: 'wrapped-for-stale-claim-user',
                })
                .executeTakeFirstOrThrow()

            mockClerkSession({
                clerkUserId: user.clerkId,
                userId: user.id,
                orgSlug: lab.slug,
                orgId: lab.id,
                orgType: 'lab',
                extraOrgs: [{ slug: enclave.slug, id: enclave.id, type: 'enclave' }],
            })

            const result = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'researcher' }))

            expect(result).toHaveLength(1)
            expect(result[0].recipientKeys).toEqual({ 'results.csv': 'wrapped-for-stale-claim-user' })
        })
    })

    describe('result decision actions', () => {
        test('creates FILES-REJECTED status and sends rejection email', async () => {
            const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
            const { job, study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            await rejectStudyJobFilesAction({
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
                    studyJobId: job.id,
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

            const files = actionResult(await fetchEncryptedJobFilesAction({ jobId: job.id, type: 'researcher' }))
            expect(files).toHaveLength(1)
            expect(files[0]).toMatchObject({
                studyJobFileId: file.id,
                recipientKeys: { 'results.csv': 'wrapped-for-researcher' },
            })
        })

        test('permission denied for non-enclave user', async () => {
            const { org } = await mockSessionWithTestData({ orgType: 'lab' })
            const { job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

            const result = await rejectStudyJobFilesAction({
                studyJobId: job.id,
                orgSlug: org.slug,
            })

            expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        })
    })

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

        test('rejects feedback over 1800 characters on an errored run', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture({ jobStatus: 'JOB-ERRORED' })

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: 'x'.repeat(OUTPUTS_FEEDBACK_MAX_CHARACTERS + 1),
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-REJECTED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        test('rejects the same length on a completed run', async () => {
            const { enclave, job } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: 'x'.repeat(OUTPUTS_FEEDBACK_MAX_CHARACTERS + 1),
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-REJECTED')
        })

        test('accepts feedback at exactly 1800 characters', async () => {
            const { enclave, job, study } = await setupResultApprovalFixture()

            actionResult(
                await submitOutputsDecisionAction({
                    orgSlug: enclave.slug,
                    studyJobId: job.id,
                    decision: 'share-feedback-only',
                    feedback: 'x'.repeat(OUTPUTS_FEEDBACK_MAX_CHARACTERS),
                    sharedFiles: [],
                }),
            )

            expect((await jobStatuses(job.id)).map((s) => s.status)).toContain('FILES-REJECTED')
            expect(await resultsComment(study.id)).toBeDefined()
        })

        test('rejects whitespace-only feedback', async () => {
            const { enclave, job } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-feedback-only',
                feedback: '   ',
                sharedFiles: [],
            })

            expect(result).toEqual({ error: expect.objectContaining({ feedback: expect.any(String) }) })
        })

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

        test('refuses to approve when the entries carry no usable keys', async () => {
            const { enclave, file, job, study } = await setupResultApprovalFixture()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-outputs',
                feedback: 'Looks fine.',
                sharedFiles: [{ studyJobFileId: file.id, filePath: 'results.csv', keys: [] }],
            })

            expect(result).toEqual({ error: expect.objectContaining({ files: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-APPROVED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

        test('refuses to approve when an artifact is left out', async () => {
            const { enclave, job, study, sharedFiles } = await setupResultApprovalFixture()

            await db
                .insertInto('studyJobFile')
                .values({
                    path: 'results/encrypted-logs.zip',
                    name: 'encrypted-logs.zip',
                    studyJobId: job.id,
                    fileType: 'ENCRYPTED-CODE-RUN-LOG',
                })
                .executeTakeFirstOrThrow()

            const result = await submitOutputsDecisionAction({
                orgSlug: enclave.slug,
                studyJobId: job.id,
                decision: 'share-outputs',
                feedback: 'Sharing only part of it.',
                sharedFiles,
            })

            expect(result).toEqual({ error: expect.objectContaining({ files: expect.any(String) }) })
            expect((await jobStatuses(job.id)).map((s) => s.status)).not.toContain('FILES-APPROVED')
            expect(await resultsComment(study.id)).toBeUndefined()
        })

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
