'use server'

import { ActionFailure, isPgUniqueViolation, throwNotFound } from '@/lib/errors'
import { isApprovedLogType, isEncryptedLogType } from '@/lib/file-type-helpers'
import { normalizeFeedbackToLexical } from '@/lib/lexical'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import { OUTPUTS_FEEDBACK_MIN_WORDS, toOutputsReviewDecision } from '@/lib/outputs-review'
import { JobFile, minimalJobInfoSchema, sharedFileSchema } from '@/lib/types'
import {
    codeSubmissionVersion,
    getLabPublicKeysForStudy,
    getUserPublicKey,
    getSharedFileIdsForJob,
    getStudyJobInfo,
    getStudyReviewForJob,
    latestJobForStudy,
} from '@/server/db/queries'
import { onStudyResultsApproved, onStudyResultsRejected, onStudyReviewRequested } from '@/server/events'
import { insertSharedFileKeys } from '@/server/results-sharing'
import { fetchFileContents } from '@/server/storage'
import { Action, z } from './action'

export const approveStudyJobFilesAction = new Action('approveStudyJobFilesAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            jobInfo: minimalJobInfoSchema,
            sharedFiles: z.array(sharedFileSchema),
        }),
    )
    .middleware(async ({ params: { jobInfo }, db }) => {
        const study = await db
            .selectFrom('study')
            .select('orgId')
            .where('id', '=', jobInfo.studyId)
            .executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { jobInfo: info, sharedFiles }, session, db }) => {
        // Re-wrap, not re-encrypt: persist only the wrapped-key rows the reviewer's browser
        // produced. Ciphertext untouched; server never sees plaintext. The FILES-APPROVED status
        // below is the all-or-nothing approval fact.
        //
        // No backfill for late joiners: keys are wrapped only for lab members with a registered key
        // at approval time. Registering a key later can't unlock already-approved results —
        // re-wrapping needs the raw AES key, which the browser no longer holds.
        await insertSharedFileKeys(db, info.studyJobId, sharedFiles)

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-APPROVED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: session.user.id, lastUpdatedAt: new Date() })
            .where('id', '=', info.studyId)
            .execute()

        onStudyResultsApproved({ studyId: info.studyId, userId: session.user.id })
    })

// Lab (researcher) public keys the reviewer's browser re-wraps approved files for.
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

// IDs of the job's artifacts shared with researchers, derived from the re-wrapped key rows. Empty
// before approval.
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
        minimalJobInfoSchema.extend({
            orgSlug: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ params: info, session, db }) => {
        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-REJECTED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: session.user.id, lastUpdatedAt: new Date() })
            .where('id', '=', info.studyId)
            .execute()

        // TODO Confirm / Make sure we delete files from S3 when rejecting?
        onStudyResultsRejected({ studyId: info.studyId, userId: session.user.id })
    })

// OTTER-675: the Data Partner's single decision on a job's decrypted outputs. Feedback and the
// files decision land together so the reviewer's rationale can never be orphaned from the status
// that acted on it — the reason this exists instead of calling approve/reject plus a second write.
//
// 'share-outputs' does exactly what approveStudyJobFilesAction does (persist the browser's
// re-wrapped keys, then FILES-APPROVED); 'share-feedback-only' does what
// rejectStudyJobFilesAction does (FILES-REJECTED, files stay unshared). Those two actions remain
// for the older results screen.
export const submitOutputsDecisionAction = new Action('submitOutputsDecisionAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            jobInfo: minimalJobInfoSchema,
            decision: z.enum(['share-outputs', 'share-feedback-only']),
            feedback: z.string(),
            maxWords: z.number().int().positive(),
            // Empty for 'share-feedback-only': nothing is shared, so there are no keys to re-wrap.
            sharedFiles: z.array(sharedFileSchema),
        }),
    )
    .middleware(async ({ params: { jobInfo }, db }) => {
        const study = await db
            .selectFrom('study')
            .select('orgId')
            .where('id', '=', jobInfo.studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId }
    })
    .requireAbilityTo('review', 'Study')
    .handler(async ({ params: { jobInfo: info, decision, feedback, maxWords, sharedFiles }, session, db }) => {
        const userId = session.user.id

        const { json, wordCount } = normalizeFeedbackToLexical(feedback)
        if (wordCount < OUTPUTS_FEEDBACK_MIN_WORDS) {
            throw new ActionFailure({ feedback: 'Feedback is required' })
        }
        if (wordCount > maxWords) {
            throw new ActionFailure({ feedback: `Feedback must be ${maxWords} words or fewer (got ${wordCount})` })
        }

        const shareOutputs = decision === 'share-outputs'

        // A files decision is final, so refuse outright if one already exists. This cannot be left
        // to the (studyJobId, reviewKind, round) unique constraint: FILES-APPROVED/FILES-REJECTED
        // are themselves round-opening events, so once the first decision lands
        // codeSubmissionVersion returns the NEXT round and a second attempt would slot in beside
        // it rather than collide — writing a phantom decision for a round whose code was never
        // resubmitted. The constraint still covers the genuine same-round race below, where two
        // reviewers both read the pre-decision round before either commits.
        const existingDecision = await db
            .selectFrom('jobStatusChange')
            .select('id')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', 'in', ['FILES-APPROVED', 'FILES-REJECTED'])
            .executeTakeFirst()

        if (existingDecision) {
            throw new ActionFailure({
                study: 'another reviewer has already submitted a decision for these outputs',
            })
        }

        // Read the round BEFORE writing the status below, for the same reason.
        const round = await codeSubmissionVersion(info.studyId, db)

        try {
            await db
                .insertInto('studyReviewComment')
                .values({
                    studyId: info.studyId,
                    studyJobId: info.studyJobId,
                    authorId: userId,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: toOutputsReviewDecision(decision),
                    body: JSON.parse(json),
                    round,
                })
                .executeTakeFirstOrThrow()
        } catch (err) {
            // The (studyJobId, reviewKind, round) unique constraint fires when two reviewers submit
            // a decision on the same outputs within the same round. The first write is already
            // safe, so the loser gets a clean message rather than a duplicate-key error.
            if (isPgUniqueViolation(err)) {
                throw new ActionFailure({
                    study: 'another reviewer has already submitted a decision for these outputs',
                })
            }
            throw err
        }

        if (shareOutputs) {
            // Re-wrap, not re-encrypt: only the wrapped keys the reviewer's browser produced are
            // persisted. Ciphertext untouched; the server never sees plaintext or a raw AES key.
            await insertSharedFileKeys(db, info.studyJobId, sharedFiles)
        }

        await db
            .insertInto('jobStatusChange')
            .values({
                userId,
                status: shareOutputs ? 'FILES-APPROVED' : 'FILES-REJECTED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        await db
            .updateTable('study')
            .set({ reviewerId: userId, lastUpdatedAt: new Date() })
            .where('id', '=', info.studyId)
            .execute()

        // The decision is final, so the collaborative draft has no further purpose; dropping it
        // also stops a stale tab from resurrecting text after submission.
        await db.deleteFrom('yjsDocument').where('name', '=', outputsReviewFeedbackDocName(info.studyJobId)).execute()

        if (shareOutputs) {
            onStudyResultsApproved({ studyId: info.studyId, userId })
        } else {
            onStudyResultsRejected({ studyId: info.studyId, userId })
        }
    })

export const loadStudyJobAction = new Action('loadStudyJobAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status } // orgId + status are validated in requireAbilityTo below
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
        return { studyJob, orgId: studyJob.orgId, status: studyJob.status } // Return the job along with the orgId + status for validation in requireAbilityTo below
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

// Reviewer-triggered retry after a failed summary generation. Clears the
// failure row so the generator re-enters cleanly, then re-fires the same
// deferred task code submission uses. Only a failed row is cleared — a
// successful review is left untouched so a stray retry can't wipe it.
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
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status } // Return the jobInfo along with the orgId + status for validation in requireAbilityTo below
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

export const fetchEncryptedJobFilesAction = new Action('fetchEncryptedJobFilesAction')
    .params(
        z.object({
            jobId: z.string(),
        }),
    )
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        // Include submittedByOrgId so 'view StudyJob' matches lab researchers, not just enclave
        // reviewers — researchers fetch their own re-wrapped result files here.
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob, session, db }) => {
        const userKey = await getUserPublicKey(session.user.id)
        if (!userKey) return []

        const encryptedFiles = studyJob.files.filter(
            (file) => isEncryptedLogType(file.fileType) || file.fileType === 'ENCRYPTED-RESULT',
        )
        if (!encryptedFiles.length) return []

        // Enclave reviewers are manifest recipients and decrypt with their own key; lab researchers
        // aren't, so they get per-file re-wrapped keys (study_job_file_recipient_key) as `recipientKeys`. A
        // reviewer is a member of the study's enclave org; everyone else takes the researcher path.
        const isEnclaveReviewer = Object.values(session.orgs).some(
            (org) => org.id === studyJob.orgId && org.type === 'enclave',
        )

        // TODO(perf): ciphertext bodies are buffered into server memory and serialized through the
        // action layer. Fine at current sizes; if it grows, hand the client a signed S3 URL to
        // fetch + decrypt directly instead.
        if (isEnclaveReviewer) {
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

        // Researcher: only artifacts this user has wrapped keys for (exist only post-approval, so
        // naturally gated). Build the {file_path -> crypt} map per artifact.
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
