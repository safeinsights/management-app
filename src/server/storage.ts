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

// An artifact slot is one (job, storage path, file type), the same key the partial unique index added
// in 1780500000000 enforces. Keeping the lookup, the constraint and the migration on one key is what
// makes "one row per artifact" a single rule instead of three that can drift apart.
async function artifactRowForSlot(studyJobId: string, path: string, fileType: FileType) {
    return await db
        .selectFrom('studyJobFile')
        .select('id')
        .where('studyJobId', '=', studyJobId)
        .where('path', '=', path)
        .where('fileType', '=', fileType)
        .executeTakeFirst()
}

/**
 * Store one artifact against a job, reusing the existing row for its slot (OTTER-642).
 *
 * `path` is derived from the job and the artifact type, so a re-delivered ingest webhook overwrites
 * the same S3 object. Inserting unconditionally therefore produced a second row pointing at that same
 * object, which the reviewer and researcher saw as the log/result listed twice. Update in place
 * instead, so a retry refreshes the artifact rather than duplicating it.
 *
 * `isNew` reports whether this call added an artifact the job did not already have, so a retry does
 * not announce the run's outcome a second time. `stored` reports whether the artifact this call
 * carried actually landed, which is false only for a late delivery the round-closed guard dropped.
 *
 * One window stays open: the round can close between the guard below and the upload, so a
 * re-delivery landing inside it still replaces a just-released ciphertext. Closing it means holding a
 * row lock across an S3 upload, which trades a rare narrow race for a slow transaction on every
 * delivery. The concurrent-first-delivery race is closed by the unique index rather than by a lock:
 * the loser's insert conflicts, and it is recovered below as the repeat it effectively is.
 */
async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType) {
    const existing = await artifactRowForSlot(info.studyJobId, path, fileType)

    // Once the round is decided the artifact has been released, and a late re-delivery is stale by
    // definition. Overwriting the object would strand the researcher: their per-file keys were wrapped
    // from the AES keys of the ciphertext being replaced, so an already-released file would stop
    // decrypting, and the bucket is unversioned so the replaced copy is gone for good. Ignore the
    // delivery entirely. A first-ever arrival for a slot is still stored - nothing was released for
    // it, so there is nothing to protect and dropping it would lose data.
    //
    // The sender gets a success response either way (it has nothing to do differently), so log the
    // drop: without it, content that was accepted but never stored leaves no trace to diagnose from.
    if (existing && (await roundIsClosed(info.studyJobId))) {
        logger.warn(
            `ignoring re-delivered ${fileType} for job ${info.studyJobId} at ${path}: the round is already decided and the stored copy has been released`,
        )
        return { ...existing, isNew: false, stored: false }
    }

    // If the write below fails (or the process dies between these two writes), the S3 object is left
    // orphaned with no row pointing at it. Nothing reads it and nothing collects it: this bucket has
    // no lifecycle rule (see iac/management-app/app-stack.ts), so it simply sits there. Accepted
    // rather than run as a two-phase commit.
    await storeS3File(info, file.stream(), path)

    if (existing) return { ...(await renameArtifactRow(existing.id, file.name)), isNew: false, stored: true }

    // DO NOTHING rather than letting the unique index raise: a raised violation aborts the surrounding
    // transaction, so the recovery below could not run if a caller ever wrapped this in one. Left
    // untargeted because inferring a partial index as the arbiter means restating its predicate here,
    // and a second place to keep in sync is exactly what this design is removing. The only other
    // unique index on the table is the primary key, which a fresh v7uuid cannot collide with.
    const inserted = await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType })
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst()

    if (inserted) return { ...inserted, isNew: true, stored: true }

    // A concurrent first delivery claimed the slot between the lookup and the insert. It is the same
    // artifact at the same path, so treat this call as the repeat it effectively is: refresh the
    // winner's name and report it as not new, so only one delivery announces the run's outcome.
    const winner = await artifactRowForSlot(info.studyJobId, path, fileType)
    if (!winner) {
        throw new Error(`storing ${fileType} for job ${info.studyJobId} at ${path} conflicted with no visible row`)
    }

    return { ...(await renameArtifactRow(winner.id, file.name)), isNew: false, stored: true }
}

// Only the name can differ between deliveries to one slot: the job, path and type are the key, and
// nothing else on the row is derived from the payload.
async function renameArtifactRow(id: string, name: string) {
    return await db
        .updateTable('studyJobFile')
        .set({ name })
        .where('id', '=', id)
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
