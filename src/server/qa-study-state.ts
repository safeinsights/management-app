// Drives a study and its latest job to an arbitrary status without running the enclave. Runs on
// production like the rest of /api/qa, so every study must clear findQaStudy's email guard.
import { type Kysely } from 'kysely'
import { type DB, type StudyJobStatus, type StudyStatus, type FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { getOrgPublicKeys } from '@/server/db/queries'
import { getOrCreateCurrentRoundJob } from '@/server/db/mutations'
import { storeStudyEncryptedLogFile, storeStudyEncryptedResultsFile } from '@/server/storage'
import { QaCleanupNotFoundError } from '@/server/qa-cleanup'
import { QaInvalidRequestError } from '@/server/qa-provision'

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
    jobCreated: boolean
    studyStatus: StudyStatus
    jobStatus: StudyJobStatus | null
    files: { key: QaFileKey; fileType: FileType; name: string }[]
}

// An org with no enrolled keys cannot produce a readable artifact, so that is a 400.
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

// Reuses the storage helpers the enclave upload calls, so the layout matches a real run.
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

// Omitted fields are untouched. Files are stored before the job status is appended, so
// RUN-COMPLETE never precedes its results. The caller must have resolved the study via findQaStudy.
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
    const needsJob = requestedFiles.length > 0 || Boolean(update.jobStatus)

    // A freshly created QA study legitimately has no job; open one only when there is something
    // job-scoped to attach.
    let studyJobId: string | null = null
    let jobCreated = false
    if (needsJob) {
        const job = await getOrCreateCurrentRoundJob(db, study.studyId)
        studyJobId = job.id
        jobCreated = job.created
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

    // job_status_change is append-only; the current status is its newest row.
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
        jobCreated,
        studyStatus,
        jobStatus: update.jobStatus ?? null,
        files,
    }
}
