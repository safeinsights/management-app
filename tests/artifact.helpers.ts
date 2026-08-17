import { db } from '@/database'
import type { FileType } from '@/database/types'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { readTestSupportFile } from './unit.helpers'

// Job artifact fixtures. Kept beside unit.helpers rather than inside it so the si-encryption import
// only loads for the suites that actually seed artifacts.

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

const artifactPath = (jobId: string, name: string) => `test-org/${jobId}/results/${name}`

/**
 * One `studyJobFile` row with no encrypted body behind it.
 *
 * A real shape rather than a shortcut: the containerizer stores a plaintext PACKAGING-ERROR-LOG on
 * its own when the org has no key holders, and pre-#764 jobs hold plaintext APPROVED-* results.
 *
 * Idempotent, because the artifact-slot unique index forbids a second row for a slot the job
 * already has, and a suite may seed the same artifact twice across a setup helper and a test.
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
    /** Defaults per type, so seeding two artifact types against one job cannot collide on path. */
    name?: string
}

/**
 * Encrypts an artifact the way the enclave does, whole zip with an embedded manifest, against the
 * test public key. A suite that then enters the matching private key drives a genuine decryption
 * rather than a stubbed callback, which is what makes the reviewer's phase flip worth asserting.
 *
 * Returns the shape `fetchEncryptedJobFilesAction` hands the UI, so a suite can mock that action
 * with the result and have the row and the payload describe the same artifact.
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
