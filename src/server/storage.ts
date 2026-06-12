import { deleteS3File, fetchS3File, signedUrlForFile, storeS3File } from './aws'
import { MinimalJobInfo, MinimalStudyInfo, StudyDocumentType } from '@/lib/types'
import { pathForStudyDocumentFile, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { db } from '@/database'
import { FileType } from '@/database/types'
import { decomposeResultsZip } from 'si-encryption/job-results/decompose'

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

async function storeJobFile(info: MinimalJobInfo, path: string, file: File, fileType: FileType, sourceId?: string) {
    await storeS3File(info, file.stream(), path)

    return await db
        .insertInto('studyJobFile')
        .values({ path, name: file.name, studyJobId: info.studyJobId, fileType, sourceId })
        .executeTakeFirstOrThrow()
}

/**
 * Decompose a ResultsWriter zip on ingest (Option B): each encrypted file body
 * becomes its own S3 object, and its metadata (iv, bytes) + per-recipient wrapped
 * keys (the DO/reviewer recipients from the manifest) are stored in Postgres.
 *
 * Touches no plaintext and needs no private key — the manifest is plaintext
 * metadata and the bodies stay ciphertext. One row per decomposed file; sharing
 * a file later = adding a `study_job_file_key` row, never re-encrypting.
 *
 * Trust model is honest-but-curious: the server is the storage authority for the
 * ciphertext bodies + IVs but is trusted not to tamper with them. The AES-CBC
 * scheme gives confidentiality (the server can never read results), not integrity
 * — there's no auth tag, so a *malicious* server could alter ciphertext undetected.
 * If that ever becomes part of the threat model, move to AEAD (AES-GCM) or have the
 * enclave sign (iv ‖ ciphertext) for client-side verification.
 */
async function storeDecomposedEncryptedFiles(info: MinimalJobInfo, file: File, fileType: FileType, subdir: string) {
    const decomposed = await decomposeResultsZip(file)
    // entry.path is the inner filename from TOA's manifest. TOA is trusted, so we use it
    // directly as the S3 key suffix; if that trust ever weakens, sanitize for `..`/collisions.
    const items = decomposed.map((entry) => ({
        entry,
        path: `${pathForStudyJob(info)}/results/${subdir}/${entry.path}`,
    }))

    // Write the bodies to S3 first, in parallel. S3 is not part of the DB transaction
    // below, so if the transaction fails we best-effort delete what we wrote — otherwise a
    // rollback would leave orphaned objects with no row pointing at them.
    await Promise.all(items.map(({ entry, path }) => storeS3File(info, new Blob([entry.body]).stream(), path)))

    try {
        return await db.transaction().execute(async (trx) => {
            const rows = []
            const wrappedKeys = []
            for (const { entry, path } of items) {
                const row = await trx
                    .insertInto('studyJobFile')
                    .values({
                        path,
                        name: entry.path,
                        studyJobId: info.studyJobId,
                        fileType,
                        iv: entry.iv,
                        bytes: entry.bytes,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow()

                for (const [fingerprint, { crypt }] of Object.entries(entry.keys)) {
                    wrappedKeys.push({ studyJobFileId: row.id, fingerprint, crypt })
                }
                rows.push(row)
            }
            if (wrappedKeys.length) await trx.insertInto('studyJobFileKey').values(wrappedKeys).execute()
            return rows
        })
    } catch (err) {
        await Promise.allSettled(items.map(({ path }) => deleteS3File(path)))
        throw err
    }
}

export async function storeStudyEncryptedLogFile(info: MinimalJobInfo, file: File, fileType: FileType) {
    return await storeDecomposedEncryptedFiles(info, file, fileType, 'encrypted-logs')
}

export async function storeStudyLogFile(info: MinimalJobInfo, file: File, fileType: FileType) {
    const filename = fileType.toLowerCase()
    return await storeJobFile(info, `${pathForStudyJob(info)}/results/${filename}.txt`, file, fileType)
}

export async function storeStudyEncryptedResultsFile(info: MinimalJobInfo, file: File) {
    return await storeDecomposedEncryptedFiles(info, file, 'ENCRYPTED-RESULT', 'encrypted')
}
