'use server'

import { ActionFailure, isPgUniqueViolation } from '@/lib/errors'
import { isApprovedLogType, isEncryptedArtifact, isEncryptedLogType } from '@/lib/file-type-helpers'
import { normalizeFeedbackToLexical } from '@/lib/lexical'
import { outputsReviewFeedbackDocName } from '@/lib/collaboration-documents'
import {
    hasOutputsDecision,
    hasReviewableOutputs,
    OUTPUTS_FEEDBACK_MIN_WORDS,
    outputsFeedbackMaxWords,
    toOutputsReviewDecision,
} from '@/lib/outputs-review'
import { JobFile, sharedFileSchema, type SharedFile } from '@/lib/types'
import type { FileType } from '@/database/types'
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

/**
 * Guards what "share outputs" actually promises: the lab can open every encrypted artifact of
 * this job.
 *
 * Three ways a request can fail that promise, none of which insertSharedFileKeys catches:
 *  - no entries at all, so FILES-APPROVED is recorded while nothing is granted;
 *  - entries whose `keys` array is empty, which insertSharedFileKeys turns into zero rows and
 *    returns silently (this is also what buildSharedFiles produces when the lab has no
 *    registered public keys, so it happens without anyone acting in bad faith);
 *  - a subset: one valid artifact named while the job's other artifacts are omitted.
 *
 * Failing loudly is the point. Recording an approval the lab cannot act on is worse than
 * refusing, because the study looks finished to everyone while the results stay unreadable.
 */
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

// The study is resolved from the job, not taken alongside it. Authorizing a caller-supplied
// studyId while mutating a caller-supplied studyJobId lets a reviewer entitled to study A name a
// job in study B and have the ability check pass against the wrong study.
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
        // Re-wrap, not re-encrypt: persist only the wrapped-key rows the reviewer's browser
        // produced. Ciphertext untouched; server never sees plaintext. The FILES-APPROVED status
        // below is the all-or-nothing approval fact.
        //
        // No backfill for late joiners: keys are wrapped only for lab members with a registered key
        // at approval time. Registering a key later can't unlock already-approved results —
        // re-wrapping needs the raw AES key, which the browser no longer holds.
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

// Study resolved from the job, for the same reason as approveStudyJobFilesAction above.
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

        // TODO Confirm / Make sure we delete files from S3 when rejecting?
        onStudyResultsRejected({ studyId: studyJob.studyId, userId: session.user.id })
    })

// OTTER-675: the Data Partner's single decision on a job's decrypted outputs. Feedback and the
// files decision land together so the reviewer's rationale can never be orphaned from the status
// that acted on it. That is why this exists instead of calling approve/reject plus a second write.
//
// 'share-outputs' does exactly what approveStudyJobFilesAction does (persist the browser's
// re-wrapped keys, then FILES-APPROVED); 'share-feedback-only' does what
// rejectStudyJobFilesAction does (FILES-REJECTED, files stay unshared). Those two actions remain
// for the older results screen.
export const submitOutputsDecisionAction = new Action('submitOutputsDecisionAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            // Only the job id is trusted; the study and its org are derived from it in the
            // middleware. Accepting a caller-supplied studyId alongside it would let a reviewer
            // authorized for study A name a job belonging to study B and have the ability check
            // pass against the wrong study.
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
    .handler(async ({ params: { decision, feedback, sharedFiles }, studyJob, session, db }) => {
        const userId = session.user.id
        const studyId = studyJob.studyId
        const studyJobId = studyJob.studyJobId
        const jobStatuses = studyJob.statusChanges.map((change) => change.status)

        // Server-side state gate. UI routing decides which screen renders, but it is not an
        // invariant a server action can lean on: without this, an authorized direct caller could
        // finalize an INITIATED, still-running, or long-closed job.
        if (!hasReviewableOutputs(jobStatuses)) {
            throw new ActionFailure({ study: 'has no outputs ready for a decision' })
        }

        // A files decision is final, so refuse outright if one already exists. This cannot be left
        // to the (studyJobId, reviewKind, round) unique constraint: FILES-APPROVED/FILES-REJECTED
        // are themselves round-opening events, so once the first decision lands
        // codeSubmissionVersion returns the NEXT round and a second attempt would slot in beside
        // it rather than collide, writing a phantom decision for a round whose code was never
        // resubmitted. The constraint still covers the genuine same-round race below, where two
        // reviewers both read the pre-decision round before either commits.
        if (hasOutputsDecision(jobStatuses)) {
            throw new ActionFailure({
                study: 'another reviewer has already submitted a decision for these outputs',
            })
        }

        // The cap is a property of the run being reviewed, not of the request. Taking it from the
        // client would let a caller raise its own limit to anything.
        const maxWords = outputsFeedbackMaxWords(jobStatuses)

        const { json, wordCount } = normalizeFeedbackToLexical(feedback)
        if (wordCount < OUTPUTS_FEEDBACK_MIN_WORDS) {
            throw new ActionFailure({ feedback: 'Feedback is required' })
        }
        if (wordCount > maxWords) {
            throw new ActionFailure({ feedback: `Feedback must be ${maxWords} words or fewer (got ${wordCount})` })
        }

        const shareOutputs = decision === 'share-outputs'

        if (shareOutputs) {
            assertSharesEveryArtifact(studyJob.files, sharedFiles)
        }

        // Read the round BEFORE writing the status below, for the same reason.
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

        // The decision is final, so the collaborative draft has no further purpose. Deleting it is
        // only half the job: the editor service's persist gate refuses further writes to a decided
        // job's document (shouldPersistDocument), which is what stops an already-connected tab from
        // recreating the row a moment later.
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
            // The caller states which role it is acting as. This used to be inferred from
            // session.orgs, which cannot answer the question: the claim survives removal from an
            // org, and a dual-role lab+enclave user is legitimately both. Either way they were
            // treated as a reviewer and handed recipientKeys:{}, and since their fingerprint is
            // absent from the zip's manifest, decrypt failed as "private key is not valid".
            type: z.enum(['researcher', 'reviewer']),
        }),
    )
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        // Include submittedByOrgId so 'view StudyJob' matches lab researchers, not just enclave
        // reviewers — researchers fetch their own re-wrapped result files here.
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

        // TODO(perf): ciphertext bodies are buffered into server memory and serialized through the
        // action layer. Fine at current sizes; if it grows, hand the client a signed S3 URL to
        // fetch + decrypt directly instead.
        if (type === 'reviewer') {
            // Reviewers are recipients of the zip's embedded manifest and decrypt with their own
            // key, so they need no re-wrapped keys. The manifest is encrypted to the enclave's
            // public keys, so asking for this path without one yields ciphertext that cannot be
            // opened — the encryption gates this, not the parameter.
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

        // Researcher: only artifacts this user has wrapped keys for. Rows are written solely for
        // lab recipients (insertSharedFileKeys) and only post-approval, so the set is naturally
        // gated. Build the {file_path -> crypt} map per artifact.
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
