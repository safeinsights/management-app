import { fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { db } from '@/database'
import { DB, FileType } from '@/database/types'
import { Kysely } from 'kysely'

export async function fetchFileContents(filePath: string) {
    const stream = await fetchS3File(filePath)
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return new Blob(chunks as BlobPart[])
}

export async function urlForFile(filePath: string): Promise<string> {
    return await signedUrlForFile(filePath)
}

export async function urlForStudyJobCodeFile(info: MinimalJobInfo, fileName: string) {
    return urlForFile(pathForStudyJobCodeFile(info, fileName))
}

export async function urlForStudyDocumentFile(info: MinimalStudyInfo, fileType: StudyDocumentType, fileName: string) {
    return urlForFile(pathForStudyDocumentFile(info, fileType, fileName))
}

// `executor` lets a caller run the row insert on an open transaction so the write shares that
// transaction's connection. A caller that stores files inside a db.transaction() MUST pass its trx:
// the default global `db` would take a second pool connection and deadlock against the transaction
// holding the first.
async function storeJobFile(
    info: MinimalJobInfo,
    path: string,
    file: File,
    fileType: FileType,
    sourceId?: string,
    executor: Kysely<DB> = db,
) {
    // If the insert below fails (or the process dies between these two writes), the S3 object is
    // orphaned with no row pointing at it. Left to an S3 lifecycle/sweeper rather than a 2-phase commit.
    await storeS3File(info, file.stream(), path)

    // Idempotent on (study_job_id, path): a retried/re-delivered ingest webhook overwrites the same
    // S3 object, so it must update the existing row in place rather than insert a duplicate that
    // shows up as a doubled log/result in the reviewer and researcher views (OTTER-642).
    return await executor
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType, sourceId })
        .onConflict((oc) => oc.columns(['studyJobId', 'path']).doUpdateSet({ name: file.name, fileType, sourceId }))
        .executeTakeFirstOrThrow()
}

export async function storeStudyEncryptedLogFile(
    info: MinimalJobInfo,
    file: File,
    fileType: FileType,
    executor: Kysely<DB> = db,
) {
    const filename = fileType.toLowerCase()
    return await storeJobFile(
        info,
        `${pathForStudyJob(info)}/results/${filename}.zip`,
        file,
        fileType,
        undefined,
        executor,
    )
}

export async function storeStudyLogFile(info: MinimalJobInfo, file: File, fileType: FileType) {
    const filename = fileType.toLowerCase()
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/${filename}.txt`, file, fileType)
}

// Stored as one whole-zip archive (manifest + all per-file ciphertexts) per `study_job_file` row,
// but crypto is per inner file (own AES key + IV in the embedded manifest). So sharing re-wraps
// each inner file's key separately. Format unchanged from prod — no re-encrypt or repackage.
export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File, executor: Kysely<DB> = db) {
    return await storeJobFile(
        info,
        `${pathForStudyJob(info)}/results/encrypted-results.zip`,
        file,
        'ENCRYPTED-RESULT',
        undefined,
        executor,
    )
}
