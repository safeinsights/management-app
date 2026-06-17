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
        // Re-wrap, not re-encrypt: the reviewer's browser unwrapped the results' AES key while
        // reviewing and wrapped it for the lab researchers' public keys. We only persist those
        // wrapped-key rows — the ciphertext is never touched and the server never sees plaintext
        // or the raw AES key. Adding a wrapped key = sharing. The FILES-APPROVED status change
        // below is the all-or-nothing approval fact itself.
        //
        // KNOWN LIMITATION — late-joining researchers (OUT OF SCOPE, per Phil 2026-06):
        // Keys are wrapped only for lab members with a registered public key at approval time. A
        // researcher who joins or generates their key *after* approval gets no wrapped key and
        // cannot read already-approved results. There is intentionally NO backfill: once approved,
        // the reviewer's browser no longer holds the raw AES key, so re-wrapping for a late joiner
        // would require re-opening and re-decrypting. Researchers must register keys before
        // approval. FLAG FOR PO: if backfill is ever required, a recovery flow would land here.
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

// IDs of the job's artifacts shared with researchers — derived from the re-wrapped key rows (see
// getSharedFileIdsForJob), so it reflects whatever was shared at approve time (results, or
// results + logs). Empty before approval. There is no plaintext approved copy.
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
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId } // orgId is validated in requireAbilityTo below
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
        // Include submittedByOrgId so the 'view StudyJob' ability matches lab researchers, not
        // just enclave reviewers (permissions.ts permits view when submittedByOrgId ∈ the user's
        // researcher orgs) — researchers fetch their own re-wrapped result files here.
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId }
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob, session, db }) => {
        const userKey = await getUserPublicKey(session.user.id)
        if (!userKey) return []

        const encryptedFiles = studyJob.files.filter(
            (file) => isEncryptedLogType(file.fileType) || file.fileType === 'ENCRYPTED-RESULT',
        )
        if (!encryptedFiles.length) return []

        // Each artifact is the prod whole-zip (embedded manifest). Enclave reviewers are manifest
        // recipients and decrypt with their own key; lab researchers are not, so they decrypt with
        // per-file re-wrapped keys (study_job_file_key) supplied as `overrideKeys`. A reviewer is
        // a member of the study's enclave org (study.orgId); everyone else takes the researcher
        // path.
        const isEnclaveReviewer = Object.values(session.orgs).some(
            (org) => org.id === studyJob.orgId && org.type === 'enclave',
        )

        // TODO(perf): every ciphertext body is buffered into server memory and serialized through
        // the server-action layer. DEFERRED on purpose (Phil 2026-06) — fine at current result
        // sizes. ESCAPE HATCH if we hit limits: hand the client a short-lived signed S3 URL to
        // fetch + decrypt ciphertext directly, instead of proxying through here.
        if (isEnclaveReviewer) {
            return Promise.all(
                encryptedFiles.map(async (file) => ({
                    studyJobFileId: file.id,
                    fileType: file.fileType,
                    name: file.name,
                    encryptedBody: await (await fetchFileContents(file.path)).arrayBuffer(),
                    overrideKeys: {} as Record<string, string>,
                })),
            )
        }

        // Researcher: return only artifacts this user has wrapped keys for. Approval re-wraps both
        // results and logs (all-or-nothing), so both can appear here; keys exist only after
        // approval, so this is naturally gated. Build the {file_path -> crypt} override map per
        // artifact.
        const wrappedKeys = await db
            .selectFrom('studyJobFileKey')
            .select(['studyJobFileId', 'filePath', 'crypt'])
            .where(
                'studyJobFileId',
                'in',
                encryptedFiles.map((f) => f.id),
            )
            .where('fingerprint', '=', userKey.fingerprint)
            .execute()
        if (!wrappedKeys.length) return []

        const overrideByFileId = new Map<string, Record<string, string>>()
        for (const key of wrappedKeys) {
            const map = overrideByFileId.get(key.studyJobFileId) ?? {}
            map[key.filePath] = key.crypt
            overrideByFileId.set(key.studyJobFileId, map)
        }

        return Promise.all(
            encryptedFiles
                .filter((file) => overrideByFileId.has(file.id))
                .map(async (file) => ({
                    studyJobFileId: file.id,
                    fileType: file.fileType,
                    name: file.name,
                    encryptedBody: await (await fetchFileContents(file.path)).arrayBuffer(),
                    overrideKeys: overrideByFileId.get(file.id)!,
                })),
        )
    })
