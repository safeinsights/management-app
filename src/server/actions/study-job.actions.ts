'use server'

import { ActionFailure } from '@/lib/errors'
import { isEncryptedLogType } from '@/lib/file-type-helpers'
import { minimalJobInfoSchema, sharedFileSchema } from '@/lib/types'
import {
    getLabPublicKeysForStudy,
    getUserPublicKey,
    getSharedFileIdsForJob,
    getStudyJobInfo,
    getStudyReviewForJob,
    latestJobForStudy,
} from '@/server/db/queries'
import { onStudyResultsApproved, onStudyResultsRejected } from '@/server/events'
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
        // Re-wrap, not re-encrypt: the reviewer's browser unwrapped each file's AES key
        // while reviewing and wrapped it for the lab researchers' public keys. Here we
        // only persist those new wrapped-key rows — the file ciphertext is never touched and
        // the server never sees plaintext or the raw AES key. Adding a wrapped key = sharing;
        // deleting one (future / Card 74) = revoking.
        //
        // BACKFILL GAP (Card 73/74): keys are wrapped only for lab members who have a key
        // *right now*. A researcher who joins the lab or generates their key after approval
        // gets no wrapped key and cannot read already-approved results. Re-wrapping for late
        // joiners (the reviewer no longer holds the raw AES key, so this needs a recovery flow)
        // lands here.
        await insertSharedFileKeys(db, info.studyJobId, sharedFiles, session.user.id)

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

// IDs of files a reviewer approved & shared with researchers, per the recorded `approved_at`
// fact on each file row (see getSharedFileIdsForJob). There is no plaintext approved copy.
export const fetchSharedFileIdsAction = new Action('fetchSharedFileIdsAction')
    .params(z.object({ jobId: z.string() }))
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId }
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

export const loadStudyJobAction = new Action('loadStudyJobAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
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
        return { studyJob, orgId: studyJob.orgId } // Return the job along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => studyJob)

export const getStudyReviewAction = new Action('getStudyReviewAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { studyJobId } }) => {
        return await getStudyReviewForJob(studyJobId)
    })

export const fetchStudyJobCodeFileAction = new Action('fetchStudyJobCodeFileAction')
    .params(z.object({ studyJobId: z.string(), fileName: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob, params: { fileName } }) => {
        const file = studyJob.files.find(
            (f) => f.name === fileName && (f.fileType === 'MAIN-CODE' || f.fileType === 'SUPPLEMENTAL-CODE'),
        )
        if (!file) throw new ActionFailure({ file: `Code file "${fileName}" not found` })

        const blob = await fetchFileContents(file.path)
        const contents = await blob.text()
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
        // Include submittedByOrgId so the 'view StudyJob' ability matches lab researchers
        // (permissions.ts permits view when submittedByOrgId ∈ the user's researcher orgs),
        // not just enclave reviewers — researchers fetch their own re-wrapped result files here.
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId }
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob, session, db }) => {
        // Per decomposed file (Option B): each row is one encrypted body in S3 + an `iv`,
        // with the requesting user's wrapped AES key in study_job_file_key.
        // We return only files this user actually has a wrapped key for — others stay opaque.
        const userKey = await getUserPublicKey(session.user.id)
        if (!userKey) return []

        const encryptedFiles = studyJob.files.filter(
            (file) => isEncryptedLogType(file.fileType) || file.fileType === 'ENCRYPTED-RESULT',
        )
        if (!encryptedFiles.length) return []

        // One query for all of this user's wrapped keys, then fetch the matching bodies in
        // parallel — avoids a per-file round trip to both Postgres and S3.
        const wrappedKeys = await db
            .selectFrom('studyJobFileKey')
            .select(['studyJobFileId', 'crypt'])
            .where(
                'studyJobFileId',
                'in',
                encryptedFiles.map((f) => f.id),
            )
            .where('fingerprint', '=', userKey.fingerprint)
            .execute()
        const cryptByFileId = new Map(wrappedKeys.map((k) => [k.studyJobFileId, k.crypt]))

        const ready = encryptedFiles.flatMap((file) => {
            const crypt = cryptByFileId.get(file.id)
            // No wrapped key for this user, or no iv to decrypt with → stays opaque. A null `iv` means
            // a legacy (pre-decompose) job; those have no encrypted body here and fall back to
            // the legacy plaintext download route (src/app/dl/results/...). Intended, not a gap.
            return crypt && file.iv ? [{ file, crypt, iv: file.iv }] : []
        })

        // TODO(perf): every ciphertext body is buffered into server memory and serialized
        // through the server-action layer. Fine at current result sizes; if results grow
        // large, switch to returning signed S3 URLs and let the client fetch/decrypt as a
        // stream (also relevant: `study_job_file.bytes` is `integer`, capping at ~2.15 GB).
        return Promise.all(
            ready.map(async ({ file, crypt, iv }) => ({
                studyJobFileId: file.id,
                fileType: file.fileType,
                path: file.path,
                name: file.name,
                iv,
                crypt,
                encryptedBody: await (await fetchFileContents(file.path)).arrayBuffer(),
            })),
        )
    })
