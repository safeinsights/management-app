'use server'

import { ActionFailure, isPgUniqueViolation } from '@/lib/errors'
import { assertDecisionFeedback } from './decision-feedback'
import { isApprovedLogType, isEncryptedArtifact, isEncryptedLogType } from '@/lib/file-type-helpers'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import {
    hasOutputsDecision,
    hasReviewableOutputs,
    OUTPUTS_FEEDBACK_FIELD_TITLE,
    OUTPUTS_FEEDBACK_MAX_CHARACTERS,
    toOutputsReviewDecision,
} from '@/lib/outputs-review'
import { JobFile, sharedFileSchema, type SharedFile } from '@/lib/types'
import type { FileType } from '@/database/types'
import {
    codeSubmissionVersion,
    getLabPublicKeysForStudy,
    getUserPublicKey,
    getSharedFileIdsForJob,
    getStudyJobFileOfType,
    getStudyJobInfo,
    getStudyReviewForJob,
    latestJobForStudy,
} from '@/server/db/queries'
import { SCAN_LOG_FILE_NAME } from '@/lib/paths'
import { onStudyResultsApproved, onStudyResultsRejected, onStudyReviewRequested } from '@/server/events'
import { insertSharedFileKeys } from '@/server/results-sharing'
import { fetchFileContents } from '@/server/storage'
import { Action, z } from './action'
import { requireStudyAgreement } from '@/server/study-agreement'

// insertSharedFileKeys silently accepts partial sets, and recording an approval the lab cannot
// act on is worse than refusing.
function assertSharesEveryArtifact(
    jobFiles: ReadonlyArray<{ id: string; fileType: FileType }>,
    sharedFiles: SharedFile[],
): void {
    const keyed = new Set(sharedFiles.filter((file) => file.keys.length > 0).map((file) => file.studyJobFileId))

    if (!keyed.size) {
        throw new ActionFailure({
            files: 'no files could be shared with the lab. Confirm the lab has a registered security key.',
        })
    }

    const unshared = jobFiles.filter((file) => isEncryptedArtifact(file.fileType) && !keyed.has(file.id))
    if (unshared.length) {
        throw new ActionFailure({ files: 'some outputs were not prepared for sharing' })
    }
}

// The study is resolved from the job, not taken alongside it: otherwise a reviewer entitled to
// study A could name a job in study B and pass the ability check against the wrong study.
export const approveStudyJobFilesAction = new Action('approveStudyJobFilesAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            studyJobId: z.string(),
            sharedFiles: z.array(sharedFileSchema),
        }),
    )
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { sharedFiles }, studyJob, session, db }) => {
        // Re-wrap, not re-encrypt, so the server never sees plaintext. No backfill for late
        // joiners: re-wrapping needs an AES key the browser has already dropped.
        await insertSharedFileKeys(db, studyJob.studyJobId, sharedFiles)

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-APPROVED',
                studyJobId: studyJob.studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: session.user.id, lastUpdatedAt: new Date() })
            .where('id', '=', studyJob.studyId)
            .execute()

        onStudyResultsApproved({ studyId: studyJob.studyId, userId: session.user.id })
    })

export const fetchLabPublicKeysAction = new Action('fetchLabPublicKeysAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { studyId } }) => {
        return await getLabPublicKeysForStudy(studyId)
    })

// Derived from the re-wrapped key rows, so empty before approval.
export const fetchSharedFileIdsAction = new Action('fetchSharedFileIdsAction')
    .params(z.object({ jobId: z.string() }))
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { jobId } }) => {
        return await getSharedFileIdsForJob(jobId)
    })

export const rejectStudyJobFilesAction = new Action('rejectStudyJobFilesAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            studyJobId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ studyJob, session, db }) => {
        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-REJECTED',
                studyJobId: studyJob.studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: session.user.id, lastUpdatedAt: new Date() })
            .where('id', '=', studyJob.studyId)
            .execute()

        onStudyResultsRejected({ studyId: studyJob.studyId, userId: session.user.id })
    })

// Feedback and the files decision land together so the reviewer's rationale can never be orphaned
// from the status that acted on it (OTTER-675).
export const submitOutputsDecisionAction = new Action('submitOutputsDecisionAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            // Only the job id is trusted; the study and its org are derived from it in the
            // middleware, so a caller cannot pair study A with a job in study B.
            studyJobId: z.string(),
            decision: z.enum(['share-outputs', 'share-feedback-only']),
            feedback: z.string(),
            // Empty for 'share-feedback-only': nothing is shared, so there are no keys to re-wrap.
            sharedFiles: z.array(sharedFileSchema),
        }),
    )
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status }
    })
    .requireAbilityTo('review', 'Study')
    .middleware(requireStudyAgreement(({ studyJob }) => studyJob.studyId))
    .handler(async ({ params: { decision, feedback, sharedFiles }, studyJob, session, db }) => {
        const userId = session.user.id
        const studyId = studyJob.studyId
        const studyJobId = studyJob.studyJobId

        const jobStatuses = studyJob.statusChanges.map((change) => change.status)

        // UI routing decides which screen renders, but an authorized direct caller could otherwise
        // finalize an INITIATED, still-running, or long-closed job.
        if (!hasReviewableOutputs(jobStatuses)) {
            throw new ActionFailure({ study: 'has no outputs ready for a decision' })
        }

        // FILES-APPROVED/REJECTED are themselves round-opening, so the (studyJobId, reviewKind,
        // round) unique constraint cannot stop a second attempt writing a phantom decision.
        if (hasOutputsDecision(jobStatuses)) {
            throw new ActionFailure({
                study: 'another reviewer has already submitted a decision for these outputs',
            })
        }

        const json = assertDecisionFeedback(feedback, {
            fieldTitle: OUTPUTS_FEEDBACK_FIELD_TITLE,
            maxCharacters: OUTPUTS_FEEDBACK_MAX_CHARACTERS,
        })

        const shareOutputs = decision === 'share-outputs'

        if (shareOutputs) {
            assertSharesEveryArtifact(studyJob.files, sharedFiles)
        }

        const round = await codeSubmissionVersion(studyId, db)

        try {
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId,
                    studyJobId,
                    authorId: userId,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: toOutputsReviewDecision(decision),
                    body: JSON.parse(json),
                    round,
                })
                .executeTakeFirstOrThrow()
        } catch (err) {
            // Fires when two reviewers decide the same outputs within one round; the first write
            // is already safe, so the loser gets a clean message.
            if (isPgUniqueViolation(err)) {
                throw new ActionFailure({
                    study: 'another reviewer has already submitted a decision for these outputs',
                })
            }
            throw err
        }

        if (shareOutputs) {
            // Re-wrap, not re-encrypt: ciphertext is untouched and no raw AES key is stored.
            await insertSharedFileKeys(db, studyJobId, sharedFiles)
        }

        await db
            .insertInto('jobStatusChange')
            .values({
                userId,
                status: shareOutputs ? 'FILES-APPROVED' : 'FILES-REJECTED',
                studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: userId, lastUpdatedAt: new Date() })
            .where('id', '=', studyId)
            .execute()

        // The editor's persist gate refuses writes to a decided job, which is what stops a
        // connected tab recreating the row.
        await db.deleteFrom('yjsDocument').where('name', '=', outputsReviewFeedbackDocName(studyJobId)).execute()

        if (shareOutputs) {
            onStudyResultsApproved({ studyId, userId })
        } else {
            onStudyResultsRejected({ studyId, userId })
        }
    })

export const loadStudyJobAction = new Action('loadStudyJobAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => {
        return studyJob
    })

export const latestJobForStudyAction = new Action('latestJobForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, session }) => {
        if (!session) throw new ActionFailure({ user: 'Unauthorized' })

        const studyJob = await latestJobForStudy(studyId)
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => studyJob)

export const getStudyReviewAction = new Action('getStudyReviewAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { studyJobId } }) => {
        return await getStudyReviewForJob(studyJobId)
    })

export const regenerateStudyReviewAction = new Action('regenerateStudyReviewAction', { performsMutations: true })
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { studyJobId }, db }) => {
        await db
            .deleteFrom('studyReview')
            .where('studyJobId', '=', studyJobId)
            .where('summaryFailedAt', 'is not', null)
            .execute()
        onStudyReviewRequested({ studyJobId })
    })

export const fetchApprovedJobFilesAction = new Action('fetchApprovedJobFilesAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob }) => {
        const approvedJobFiles = studyJob.files.filter(
            (jobFile) => isApprovedLogType(jobFile.fileType) || jobFile.fileType === 'APPROVED-RESULT',
        )

        const jobFiles: JobFile[] = []
        for (const jobFile of approvedJobFiles) {
            const blob = await fetchFileContents(jobFile.path)
            const contents = await blob.arrayBuffer()
            jobFiles.push({
                contents,
                path: jobFile.name,
                fileType: jobFile.fileType,
            })
        }

        return jobFiles
    })

export const fetchStudyJobCodeFileAction = new Action('fetchStudyJobCodeFileAction')
    .params(z.object({ studyJobId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob, params: { fileName } }) => {
        const file = studyJob.files.find(
            (f) => f.name === fileName && (f.fileType === 'MAIN-CODE' || f.fileType === 'SUPPLEMENTAL-CODE'),
        )
        if (!file) throw new ActionFailure({ file: `Code file "${fileName}" not found` })

        // Raw bytes, not text: code submissions can include binary files like png plots (OTTER-516)
        const blob = await fetchFileContents(file.path)
        const contents = await blob.arrayBuffer()
        return { fileName: file.name, contents }
    })

export const fetchScanLogAction = new Action('fetchScanLogAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { studyJobId } }) => {
        // Newest row of the type, so the viewer shows the same log the displayed
        // scan statuses were parsed from and the download link serves.
        const file = await getStudyJobFileOfType(studyJobId, 'SECURITY-SCAN-LOG', false)
        if (!file) throw new ActionFailure({ file: 'No security scan log found for this job' })

        const blob = await fetchFileContents(file.path)
        return { fileName: SCAN_LOG_FILE_NAME, contents: await blob.text() }
    })

export const fetchEncryptedJobFilesAction = new Action('fetchEncryptedJobFilesAction')
    .params(
        z.object({
            jobId: z.string(),
            // session.orgs cannot answer this: a dual-role lab+enclave user is legitimately both
            // and was handed recipientKeys:{}, failing decrypt as "private key is not valid".
            type: z.enum(['researcher', 'reviewer']),
        }),
    )
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        // Include submittedByOrgId so 'view StudyJob' matches lab researchers fetching their own
        // re-wrapped result files, not just enclave reviewers.
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ params: { type }, studyJob, session, db }) => {
        const userKey = await getUserPublicKey(session.user.id)
        if (!userKey) return []

        const encryptedFiles = studyJob.files.filter(
            (file) => isEncryptedLogType(file.fileType) || file.fileType === 'ENCRYPTED-RESULT',
        )
        if (!encryptedFiles.length) return []

        // TODO(perf): ciphertext bodies are buffered into server memory. If sizes grow, hand the
        // client a signed S3 URL to fetch and decrypt directly.
        if (type === 'reviewer') {
            // Reviewers decrypt with their own key from the zip's embedded manifest; confidentiality
            // rests entirely on the ciphertext being encrypted to the enclave, not on this parameter.
            return Promise.all(
                encryptedFiles.map(async (file) => ({
                    studyJobFileId: file.id,
                    fileType: file.fileType,
                    name: file.name,
                    encryptedBody: await (await fetchFileContents(file.path)).arrayBuffer(),
                    recipientKeys: {} as Record<string, string>,
                })),
            )
        }

        // Researcher: only artifacts this user has wrapped keys for. Rows exist solely for lab
        // recipients and only post-approval, so the set is naturally gated.
        const wrappedKeys = await db
            .selectFrom('studyJobFileRecipientKey')
            .select(['studyJobFileId', 'filePath', 'crypt'])
            .where(
                'studyJobFileId',
                'in',
                encryptedFiles.map((f) => f.id),
            )
            .where('fingerprint', '=', userKey.fingerprint)
            .execute()
        if (!wrappedKeys.length) return []

        const keysByFileId = new Map<string, Record<string, string>>()
        for (const key of wrappedKeys) {
            const map = keysByFileId.get(key.studyJobFileId) ?? {}
            map[key.filePath] = key.crypt
            keysByFileId.set(key.studyJobFileId, map)
        }

        return Promise.all(
            encryptedFiles
                .filter((file) => keysByFileId.has(file.id))
                .map(async (file) => ({
                    studyJobFileId: file.id,
                    fileType: file.fileType,
                    name: file.name,
                    encryptedBody: await (await fetchFileContents(file.path)).arrayBuffer(),
                    recipientKeys: keysByFileId.get(file.id)!,
                })),
        )
    })
