import { deleteS3File, fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { db, type DBExecutor } from '@/database'
import { FileType } from '@/database/types'
import { ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'
import { errorToString } from '@/lib/errors'
import logger from '@/lib/logger'

export async function fetchFileContents(filePath: string) {
    const stream = await fetchS3File(filePath)
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return new Blob(chunks as BlobPart[])
}

export async function urlForFile(
    filePath: string,
    commandOverrides: Partial<{ ResponseContentDisposition: string; ResponseContentType: string }> = {},
): Promise<string> {
    return await signedUrlForFile(filePath, commandOverrides)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

// An existence check, so it stays independent of jobStatusChange ordering.
export async function roundIsClosed(studyJobId: string, executor: DBExecutor = db): Promise<boolean> {
    const closing = await executor
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', studyJobId)
        .where('status', 'in', ROUND_CLOSING_JOB_STATUSES)
        .executeTakeFirst()

    return Boolean(closing)
}

// Those keys were wrapped from the ciphertext currently at this path, so replacing that object
// leaves them unwrappable and the recipient loses an already-shared file.
async function artifactWasShared(studyJobFileId: string, executor: DBExecutor = db): Promise<boolean> {
    const shared = await executor
        .selectFrom('studyJobFileRecipientKey')
        .select('id')
        .where('studyJobFileId', '=', studyJobFileId)
        .executeTakeFirst()

    return Boolean(shared)
}

// Sharing is checked separately from the round because they do not coincide: approving CODE wraps
// keys while the round stays open, and keys are the thing being protected.
async function unreplaceableReason(studyJobFileId: string, studyJobId: string): Promise<string | null> {
    if (await artifactWasShared(studyJobFileId)) return 'its keys have already been wrapped for recipients'
    if (await roundIsClosed(studyJobId)) return 'the round is already decided'
    return null
}

// A slot is one (job, storage path, file type) — the same key the partial unique index enforces.
async function artifactRowForSlot(studyJobId: string, path: string, fileType: FileType) {
    return await db
        .selectFrom('studyJobFile')
        .select(['id', 'createdAt'])
        .where('studyJobId', '=', studyJobId)
        .where('path', '=', path)
        .where('fileType', '=', fileType)
        .executeTakeFirst()
}

// Reuses the existing row for a slot so a re-delivered webhook refreshes rather than duplicates
// (OTTER-642). Not atomic: closing the remaining races needs a row lock held across the S3 upload.
async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType) {
    const existing = await artifactRowForSlot(info.studyJobId, path, fileType)

    // Overwriting shared content strands the recipient: the bucket is unversioned, so a file they
    // can open today stops decrypting. Logged because the sender gets a success response either way.
    const unreplaceable = existing ? await unreplaceableReason(existing.id, info.studyJobId) : null
    if (existing && unreplaceable) {
        logger.warn(
            `ignoring re-delivered ${fileType} for job ${info.studyJobId} at ${path}: ${unreplaceable}, so the stored copy has to stay decryptable`,
        )
        return { ...existing, stored: false }
    }

    // A failure between these two writes orphans the S3 object; accepted over a two-phase commit.
    await storeS3File(info, file.stream(), path)

    if (existing) return { ...(await renameArtifactRow(existing.id, file.name)), stored: true }

    // DO NOTHING rather than letting the unique index raise: a violation aborts the surrounding
    // transaction, so the recovery below could not run.
    const inserted = await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType })
        .onConflict((oc) => oc.doNothing())
        .returning(['id', 'createdAt'])
        .executeTakeFirst()

    if (inserted) return { ...inserted, stored: true }

    // A concurrent first delivery claimed the slot; treat this call as the repeat it is so only one
    // delivery announces the run's outcome.
    const winner = await artifactRowForSlot(info.studyJobId, path, fileType)
    if (!winner) {
        throw new Error(`storing ${fileType} for job ${info.studyJobId} at ${path} conflicted with no visible row`)
    }

    return { ...(await renameArtifactRow(winner.id, file.name)), stored: true }
}

// createdAt is left untouched so callers can read it as "when this job first had this artifact".
async function renameArtifactRow(id: string, name: string) {
    return await db
        .updateTable('studyJobFile')
        .set({ name })
        .where('id', '=', id)
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()
}

export async function storeStudyEncryptedLogFile(info: MinimalJobInfo, file: File, fileType: FileType) {
    const filename = fileType.toLowerCase()
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/${filename}.zip`, file, fileType)
}

export async function storeStudyLogFile(info: MinimalJobInfo, file: File, fileType: FileType) {
    const filename = fileType.toLowerCase()
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/${filename}.txt`, file, fileType)
}

// One whole-zip archive per study_job_file row, but crypto is per inner file, so sharing re-wraps
// each inner file's key separately.
export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT')
}

const SCAN_LOG_FILE_TYPES = [
    'SECURITY-SCAN-LOG',
    'ENCRYPTED-SECURITY-SCAN-LOG',
    'APPROVED-SECURITY-SCAN-LOG',
] satisfies FileType[]

// A change-requested resubmit reuses the job, so last round's scan log would otherwise still be
// on screen as this round's verdict (OTTER-775). Row and object go together: leaving the object
// behind would let the next delivery take storeJobFile's insert path and overwrite it without
// consulting unreplaceableReason.
//
// Only the rows are deleted here. The objects cannot go in the caller's transaction: a rollback
// would restore rows over objects that are already gone, leaving jobScanResultForJob permanently in
// its catch branch with a download that 404s and no way to self-repair. The returned paths are the
// caller's to sweep once it has committed (OTTER-775 review).
export async function discardStaleScanLogRows(studyJobId: string, executor: DBExecutor = db): Promise<string[]> {
    const stale = await executor
        .selectFrom('studyJobFile')
        .select(['id', 'path'])
        .where('studyJobId', '=', studyJobId)
        .where('fileType', 'in', SCAN_LOG_FILE_TYPES)
        .execute()

    if (stale.length === 0) return []

    // Deleting an object whose keys are wrapped strands the recipient, exactly as replacing it
    // would. Sharing one log holds back the whole job rather than only that row: the delivery route
    // couples the plaintext and encrypted writes, so dropping one half leaves the next scan unable
    // to write either and the panel pending for the round (OTTER-775 review).
    const shared = await Promise.all(stale.map((file) => artifactWasShared(file.id, executor)))
    if (shared.some(Boolean)) {
        logger.warn(
            `keeping all scan logs for job ${studyJobId}: keys for ${stale
                .filter((_, i) => shared[i])
                .map((file) => file.path)
                .join(', ')} have already been wrapped for recipients`,
        )
        return []
    }

    await executor
        .deleteFrom('studyJobFile')
        .where(
            'id',
            'in',
            stale.map((file) => file.id),
        )
        .execute()

    return stale.map((file) => file.path)
}

// Best-effort companion to discardStaleScanLogRows, run after the caller commits. A failure here
// leaves an orphaned object, which the next delivery replaces; the rows are already gone, so the
// reviewer never sees the stale verdict either way.
export async function deleteDiscardedScanLogObjects(paths: ReadonlyArray<string>) {
    for (const path of paths) {
        try {
            await deleteS3File(path)
        } catch (error) {
            logger.warn(`failed to delete discarded scan log ${path}: ${errorToString(error)}`)
        }
    }
}
