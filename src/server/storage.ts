import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { db } from '@/database'
import { FileType } from '@/database/types'
import { ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'
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
    commandOverrides: Partial<{ ResponseContentDisposition: string }> = {},
): Promise<string> {
    return await signedUrlForFile(filePath, commandOverrides)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

// The round's own notion of "decided", mirroring getOrCreateCurrentRoundJob: an existence check, so it
// stays independent of jobStatusChange ordering (a round-closing status is never followed by another
// status on the same job).
async function roundIsClosed(studyJobId: string): Promise<boolean> {
    const closing = await db
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', studyJobId)
        .where('status', 'in', ROUND_CLOSING_JOB_STATUSES)
        .executeTakeFirst()

    return Boolean(closing)
}

/**
 * Store one artifact against a job, reusing the existing row for a (job, type, storage path)
 * (OTTER-642).
 *
 * `path` is derived from the job and the artifact type, so a re-delivered ingest webhook overwrites
 * the same S3 object. Inserting unconditionally therefore produced a second row pointing at that same
 * object, which the reviewer and researcher saw as the log/result listed twice. Update in place
 * instead, so a retry is a no-op rather than a duplicate.
 *
 * The check and the write are separate statements, not one atomic upsert, so this only covers
 * deliveries that arrive one after another. Two concurrent deliveries can still both find no row and
 * both insert; that is why the read side collapses duplicates in `dedupeJobArtifactFiles` rather than
 * trusting this guard alone. Closing the race outright would need a unique index, which means a
 * destructive migration over the duplicates already in the table.
 */
async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType, sourceId?: string) {
    // Keyed the same way the read side dedupes (type + path), so a row this job holds for a DIFFERENT
    // artifact is never repurposed: run logs and results shared results/encrypted-results.zip until
    // mid-2025, and matching a legacy log row here would rewrite it into a result. Ordered
    // newest-first to match dedupeJobArtifactFiles' preference, so an update lands on the row that is
    // actually displayed; rows left over from before this fix all point at the same object, so which
    // one is picked only matters for determinism.
    const existing = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', info.studyJobId)
        .where('fileType', '=', fileType)
        .where('path', '=', path)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst()

    // Once the round is decided the artifact has been released, and a late re-delivery is stale by
    // definition. Overwriting the object would strand the researcher: their per-file keys were wrapped
    // from the AES keys of the ciphertext being replaced, so an already-released file would stop
    // decrypting. Ignore the delivery entirely. A first-ever arrival for a path is still stored -
    // nothing was released for it, so there is nothing to protect and dropping it would lose data.
    //
    // The sender gets a success response either way (it has nothing to do differently), so log the
    // drop: without it, content that was accepted but never stored leaves no trace to diagnose from.
    if (existing && (await roundIsClosed(info.studyJobId))) {
        logger.warn(
            `ignoring re-delivered ${fileType} for job ${info.studyJobId} at ${path}: the round is already decided and the stored copy has been released`,
        )
        return existing
    }

    // If the write below fails (or the process dies between these two writes), the S3 object is
    // orphaned with no row pointing at it. Left to an S3 lifecycle/sweeper rather than a 2-phase commit.
    await storeS3File(info, file.stream(), path)

    if (existing) {
        return await db
            .updateTable('studyJobFile')
            .set({ name: file.name })
            .where('id', '=', existing.id)
            .returning('id')
            .executeTakeFirstOrThrow()
    }

    return await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType, sourceId })
        .returning('id')
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

// Stored as one whole-zip archive (manifest + all per-file ciphertexts) per `study_job_file` row,
// but crypto is per inner file (own AES key + IV in the embedded manifest). So sharing re-wraps
// each inner file's key separately. Format unchanged from prod — no re-encrypt or repackage.
export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT')
}
