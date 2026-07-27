/**
 * QA study-state helpers: drive a study and its latest job to an arbitrary status and
 * attach results/log artifacts, without running the enclave.
 *
 * Reaching a state like "results are back and awaiting review" normally requires a real
 * job run. QA needs to land on that state directly, so this writes the same rows the
 * real path does: a `study.status` update, an append to the `job_status_change` log, and
 * `study_job_file` rows backed by S3 objects.
 *
 * Files arrive as plaintext and are encrypted here before storage. The real enclave
 * uploads ciphertext it produced itself; QA has no enclave, so the plaintext is wrapped
 * with ResultsWriter against the reviewing org's public keys — the same recipients the
 * enclave targets — so the artifacts open in the ordinary review UI.
 *
 * Note this is upload-stage encryption only. Researchers gain access later, when a
 * reviewer approves and insertSharedFileKeys re-wraps each AES key to the lab org. QA
 * drives that second stage through the real approval flow; nothing here shortcuts it.
 *
 * Runs on production like the rest of /api/qa, so every study it touches must clear
 * `findQaStudy`'s researcher-email guard.
 */
import { type Kysely } from 'kysely'
import { type DB, type StudyJobStatus, type StudyStatus, type FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { getOrgPublicKeys } from '@/server/db/queries'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'
import { QaCleanupNotFoundError } from '@/server/qa-cleanup'
import { QaInvalidRequestError } from '@/server/qa-provision'

/** Form keys that carry a file, and the artifact each one becomes. */
export const QA_FILE_KEYS = {
    result: 'ENCRYPTED-RESULT',
    log: 'ENCRYPTED-CODE-RUN-LOG',
} as const satisfies Record<string, FileType>

export type QaFileKey = keyof typeof QA_FILE_KEYS

export type QaStudyStateUpdate = {
    studyStatus?: StudyStatus
    jobStatus?: StudyJobStatus
    files?: Partial<Record<QaFileKey, File>>
}

export type QaStudyStateResult = {
    studyId: string
    studyJobId: string | null
    studyStatus: StudyStatus
    jobStatus: StudyJobStatus | null
    files: { key: QaFileKey; fileType: FileType; name: string }[]
}

/**
 * The job a QA-attached artifact belongs to: the study's most recent one.
 *
 * Ordered by created_at with the id as a tiebreaker — v7 uuids are time-ordered, so this
 * stays deterministic for jobs minted inside the same clock tick, which fixtures do.
 */
async function latestJobId(db: Kysely<DB>, studyId: string) {
    const job = await db
        .selectFrom('studyJob')
        .select(['id'])
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst()
    return job?.id ?? null
}

/**
 * Wrap plaintext into the encrypted-zip envelope the results UI expects.
 *
 * Recipients are the org reviewing the study, mirroring encryptAndStoreLog — at upload
 * time an artifact is readable by reviewers, not yet by researchers. An org with no
 * enrolled keys cannot produce a readable artifact, so that is a 400 rather than a
 * silently undecryptable file; QA fixes it by setting a public key on a reviewer first.
 */
async function encryptForReviewers(db: Kysely<DB>, orgId: string, file: File, storedName: string) {
    const recipients = await getOrgPublicKeys(orgId)
    if (recipients.length === 0) {
        throw new QaInvalidRequestError(
            'reviewing org has no public keys enrolled; set one via PATCH /api/qa/users/{idOrEmail} before attaching files',
        )
    }

    const writer = new ResultsWriter(recipients)
    await writer.addFile(file.name || storedName, await file.arrayBuffer())
    const zipBlob = await writer.generate()

    return new File([zipBlob], storedName, { type: 'application/zip' })
}

/**
 * Encrypt and store one artifact against the job, returning what was written.
 *
 * Both branches reuse the storage helpers the enclave upload calls, so the S3 layout and
 * the study_job_file row are identical to a real run.
 */
async function storeArtifact(
    db: Kysely<DB>,
    info: { orgSlug: string; studyId: string; studyJobId: string; orgId: string },
    key: QaFileKey,
    file: File,
) {
    const fileType = QA_FILE_KEYS[key]
    const jobInfo = { orgSlug: info.orgSlug, studyId: info.studyId, studyJobId: info.studyJobId }

    if (key === 'result') {
        const encrypted = await encryptForReviewers(db, info.orgId, file, 'encrypted-results.zip')
        await storeStudyEncryptedResultsFile(jobInfo, encrypted)
    } else {
        const encrypted = await encryptForReviewers(db, info.orgId, file, 'encrypted-logs.zip')
        await storeStudyEncryptedLogFile(jobInfo, encrypted, fileType)
    }

    return { key, fileType, name: file.name }
}

/**
 * Apply any combination of study status, job status, and artifacts to a QA study.
 *
 * Omitted fields are left untouched. The caller is expected to have resolved the study
 * through findQaStudy already, which is what enforces the QA-account guard.
 *
 * Ordering is deliberate: files are stored before the job status is appended, so a status
 * of RUN-COMPLETE is never visible to a reviewer before the results it implies exist.
 */
export async function setQaStudyState(
    db: Kysely<DB>,
    study: { studyId: string; orgSlug: string },
    update: QaStudyStateUpdate,
): Promise<QaStudyStateResult> {
    const row = await db
        .selectFrom('study')
        .select(['id', 'status', 'orgId'])
        .where('id', '=', study.studyId)
        .executeTakeFirst()
    if (!row) throw new QaCleanupNotFoundError(`study ${study.studyId} not found`)

    const requestedFiles = Object.entries(update.files ?? {}).filter(([, file]) => file) as [QaFileKey, File][]
    const studyJobId = await latestJobId(db, study.studyId)

    // Both of these are job-scoped; without a job there is nothing to attach them to, and
    // silently dropping them would report a success that did not happen.
    if (!studyJobId && (requestedFiles.length > 0 || update.jobStatus)) {
        throw new QaInvalidRequestError(`study ${study.studyId} has no job to attach a status or files to`)
    }

    const files: QaStudyStateResult['files'] = []
    if (studyJobId) {
        for (const [key, file] of requestedFiles) {
            files.push(
                await storeArtifact(
                    db,
                    { orgSlug: study.orgSlug, studyId: study.studyId, studyJobId, orgId: row.orgId },
                    key,
                    file,
                ),
            )
        }
    }

    // job_status_change is an append-only log — the current status is its newest row — so
    // this inserts rather than updates, exactly as the enclave upload does.
    if (update.jobStatus && studyJobId) {
        await db.insertInto('jobStatusChange').values({ studyJobId, status: update.jobStatus }).execute()
    }

    let studyStatus = row.status
    if (update.studyStatus) {
        const updated = await db
            .updateTable('study')
            .set({ status: update.studyStatus, lastUpdatedAt: new Date() })
            .where('id', '=', study.studyId)
            .returning(['status'])
            .executeTakeFirstOrThrow()
        studyStatus = updated.status
    }

    return {
        studyId: study.studyId,
        studyJobId,
        studyStatus,
        jobStatus: update.jobStatus ?? null,
        files,
    }
}
