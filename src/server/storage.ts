import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { db, type DBExecutor } from '@/database'
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
// stays independent of jobStatusChange ordering.
//
// Consulted before storing an artifact here, and before recording an outcome in the results route. The
// scanner and containerizer routes do NOT consult it and still append their status after a decision,
// which predates this change: they drop the artifact but leave the status, and JOB-ERRORED outranks
// FILES-APPROVED on the dashboard. Making those two routes agree is its own card.
export async function roundIsClosed(studyJobId: string, executor: DBExecutor = db): Promise<boolean> {
    const closing = await executor
        .selectFrom('jobStatusChange')
        .select('id')
        .where('studyJobId', '=', studyJobId)
        .where('status', 'in', ROUND_CLOSING_JOB_STATUSES)
        .executeTakeFirst()

    return Boolean(closing)
}

// Whether anyone's wrapped AES keys already hang off this artifact. Those keys were wrapped from the
// keys inside the ciphertext stored at this path RIGHT NOW, so replacing that object leaves them
// unwrappable and the recipient loses a file that was already shared with them.
async function artifactWasShared(studyJobFileId: string): Promise<boolean> {
    const shared = await db
        .selectFrom('studyJobFileRecipientKey')
        .select('id')
        .where('studyJobFileId', '=', studyJobFileId)
        .executeTakeFirst()

    return Boolean(shared)
}

// Why a re-delivery must not replace this artifact, or null when replacing it is safe.
//
// Sharing is checked first and separately from the round, because the two do not coincide: a reviewer
// approving CODE can already re-wrap keys for researchers (approveJobCode persists them alongside
// CODE-APPROVED), and that round stays open afterwards. A round-status-only guard therefore left every
// artifact shared at code approval, scan logs included, replaceable by a delayed scanner or
// containerizer delivery. Keys are the thing being protected, so key existence is the question to ask.
async function unreplaceableReason(studyJobFileId: string, studyJobId: string): Promise<string | null> {
    if (await artifactWasShared(studyJobFileId)) return 'its keys have already been wrapped for recipients'
    if (await roundIsClosed(studyJobId)) return 'the round is already decided'
    return null
}

// An artifact slot is one (job, storage path, file type), the same key the partial unique index added
// in 1780600000000 enforces. Keeping the lookup, the constraint and the migration on one key is what
// makes "one row per artifact" a single rule instead of three that can drift apart.
async function artifactRowForSlot(studyJobId: string, path: string, fileType: FileType) {
    return await db
        .selectFrom('studyJobFile')
        .select(['id', 'createdAt'])
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
 * `isNew` reports whether this call added an artifact the job did not already have. `stored` reports
 * whether the artifact this call carried actually landed, which is false only for a late delivery the
 * round-closed guard dropped. `createdAt` is when the job first had this artifact, which a caller
 * needs to tell its own already-recorded outcome from one an earlier pipeline stage happened to
 * record under the same status name.
 *
 * The unique index closes the duplicate-ROW race: two concurrent first deliveries cannot both insert,
 * and the loser is recovered below as the repeat it effectively is. It does not make a delivery atomic,
 * and nothing here holds a lock across the S3 upload, so three windows stay open:
 *
 *   - Keys can be wrapped, or the round closed, between the guard below and the upload, so a
 *     re-delivery landing inside that window still replaces a just-shared ciphertext.
 *   - Both callers upload to the same key before either resolves its row, so S3 completion order need
 *     not match rename order: the row can end up naming one payload while holding the other's bytes.
 *     Same artifact in the same slot either way, so only the recorded name is affected.
 *   - Repeat detection is per slot, so two concurrent deliveries carrying the same pair of artifacts
 *     can split the wins (one takes the log, the other the result) and both look non-repeat to the
 *     route, which then records the outcome twice. Telling those apart needs job-level atomicity
 *     rather than an aggregate of per-slot answers.
 *
 * Closing any of them means a row lock held across an S3 upload, which trades rare narrow windows for
 * a slow transaction on every delivery.
 */
async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType) {
    const existing = await artifactRowForSlot(info.studyJobId, path, fileType)

    // A re-delivery that would replace shared or released content is stale by definition, and
    // overwriting it would strand the recipient: their per-file keys were wrapped from the AES keys of
    // the ciphertext being replaced, so a file they can open today would stop decrypting, and the
    // bucket is unversioned so the replaced copy is gone for good. Ignore the delivery entirely. A
    // first-ever arrival for a slot is still stored - nothing was shared for it, so there is nothing to
    // protect and dropping it would lose data.
    //
    // The sender gets a success response either way (it has nothing to do differently), so log the
    // drop: without it, content that was accepted but never stored leaves no trace to diagnose from.
    const unreplaceable = existing ? await unreplaceableReason(existing.id, info.studyJobId) : null
    if (existing && unreplaceable) {
        logger.warn(
            `ignoring re-delivered ${fileType} for job ${info.studyJobId} at ${path}: ${unreplaceable}, so the stored copy has to stay decryptable`,
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
        .returning(['id', 'createdAt'])
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
// nothing else on the row is derived from the payload. createdAt comes back untouched, which is what
// makes it usable as "when this job first had this artifact" by the callers deciding whether their
// outcome was already announced.
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

// Stored as one whole-zip archive (manifest + all per-file ciphertexts) per `study_job_file` row,
// but crypto is per inner file (own AES key + IV in the embedded manifest). So sharing re-wraps
// each inner file's key separately. Format unchanged from prod — no re-encrypt or repackage.
export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/encrypted-results.zip`, file, 'ENCRYPTED-RESULT')
}
