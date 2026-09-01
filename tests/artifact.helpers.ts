import { db } from '@/database'
import type { FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { readTestSupportFile } from './unit.helpers'

// Kept out of unit.helpers so the si-encryption import only loads for suites that seed artifacts.

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

const artifactPath = (jobId: string, name: string) => `test-org/${jobId}/results/${name}`

/**
 * A row with no encrypted body is a real shape, not a shortcut: the containerizer stores a
 * plaintext PACKAGING-ERROR-LOG, and pre-#764 jobs hold plaintext APPROVED-* results.
 */
export async function seedJobFileRow(jobId: string, fileType: FileType, name: string) {
    const path = artifactPath(jobId, name)
    const inserted = await db
        .insertInto('studyJobFile')
        .values({ studyJobId: jobId, name, path, fileType })
        .onConflict((oc) => oc.doNothing())
        .returning('id')
        .executeTakeFirst()

    return (
        inserted ??
        (await db
            .selectFrom('studyJobFile')
            .select('id')
            .where('studyJobId', '=', jobId)
            .where('path', '=', path)
            .where('fileType', '=', fileType)
            .executeTakeFirstOrThrow())
    )
}

type SeedEncryptedArtifactOptions = {
    fileType: FileType
    files: { name: string; content: string }[]
    name?: string
}

/**
 * Encrypts the way the enclave does, so entering the matching private key drives a genuine
 * decryption. Returns the shape `fetchEncryptedJobFilesAction` hands the UI.
 */
export async function seedEncryptedArtifact(
    jobId: string,
    { fileType, files, name = `${fileType.toLowerCase()}.zip` }: SeedEncryptedArtifactOptions,
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const file of files) await writer.addFile(file.name, toArrayBuffer(file.content))
    const zip = await writer.generate()

    const row = await seedJobFileRow(jobId, fileType, name)

    return {
        studyJobFileId: row.id,
        fileType,
        name,
        encryptedBody: await zip.arrayBuffer(),
        recipientKeys: {} as Record<string, string>,
    }
}
