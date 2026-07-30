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
 * Store one artifact against a job, reusing the existing row for a (job, storage path) (OTTER-642).
 *
 * `path` is derived from the job and the artifact type, so a re-delivered ingest webhook overwrites
 * the same S3 object. Inserting unconditionally therefore produced a second row pointing at that same
 * object, which the reviewer and researcher saw as the log/result listed twice. Update in place
 * instead, so a retry is a no-op rather than a duplicate. Keyed on the path alone to match
 * `dedupeJobArtifactFiles`, since one path can only ever hold one object.
 *
 * Two races are accepted rather than closed. The check and the write here are separate statements,
 * not one atomic upsert, so two concurrent deliveries can both find no row and both insert; the read
 * side collapses that in `dedupeJobArtifactFiles`. And the round can close between the check below
 * and the upload, so a re-delivery landing in that window still replaces a just-released ciphertext.
 * Both windows are narrow, both are strictly better than the unconditional overwrite this replaced,
 * and closing them properly means a unique index plus row locks held across an S3 upload, which is
 * the destructive migration this approach exists to avoid.
 */
async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType, sourceId?: string) {
    // Ordered newest-first to match the read-side preference in dedupeJobArtifactFiles, so an update
    // lands on the row that is actually displayed. Rows left over from before this fix all point at
    // the same object, so which one is picked only matters for determinism.
    const existing = await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', info.studyJobId)
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
            .set({ name: file.name, fileType })
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
