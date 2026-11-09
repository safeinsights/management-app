import { db } from '@/database'
import type { FileType } from '@/database/types'
import { storeS3File } from '@/server/aws'
import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { tamper, type TamperOpts } from 'si-encryption/testing/archive'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { readTestSupportFile } from './unit.helpers'

// Kept out of unit.helpers so the si-encryption import only loads for suites that seed artifacts.

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

const artifactPath = (jobId: string, name: string) => `test-org/${jobId}/results/${name}`

type KeyPair = { publicKey: ArrayBuffer; privateKey: ArrayBuffer; fingerprint: string }

// The pair tests type in as the security key.
const testKeyPair = async (): Promise<KeyPair> => {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const privateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
    return { publicKey, privateKey, fingerprint: await fingerprintKeyData(publicKey) }
}

const enclaveKeyPair = async (): Promise<KeyPair> => {
    const { exportedPublicKey, exportedPrivateKey, fingerprint } = await generateKeyPair()
    return { publicKey: exportedPublicKey, privateKey: exportedPrivateKey, fingerprint }
}

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
    // A lab researcher the artifact is shared with. It is then encrypted to another key, so the
    // test key opens it only through the wraps the researcher is sent.
    sharedWith?: string
    // Alters the archive after encryption, the way a hostile store would.
    tamperWith?: TamperOpts
}

/**
 * Encrypts the way the enclave does and stores the archive where `fetchEncryptedJobFilesAction`
 * reads it, so entering the test private key drives a genuine decryption.
 */
export async function seedEncryptedArtifact(
    jobId: string,
    { fileType, files, name = `${fileType.toLowerCase()}.zip`, sharedWith, tamperWith }: SeedEncryptedArtifactOptions,
) {
    const recipient = sharedWith ? await enclaveKeyPair() : await testKeyPair()
    const writer = new ResultsWriter([{ publicKey: recipient.publicKey, fingerprint: recipient.fingerprint }], {
        jobId,
    })
    for (const file of files) await writer.addFile(file.name, toArrayBuffer(file.content))
    const zip = await writer.generate()
    const stored = tamperWith ? await tamper(zip, tamperWith) : zip

    const row = await seedJobFileRow(jobId, fileType, name)
    await storeS3File({ orgSlug: 'test-org' }, stored.stream(), artifactPath(jobId, name))
    if (sharedWith) await shareWithResearcher(sharedWith, row.id, zip, recipient)
}

// What a reviewer's approval does: each file's key is wrapped for the researcher's registered key,
// here the test pair.
async function shareWithResearcher(researcherId: string, studyJobFileId: string, zip: Blob, enclaveKey: KeyPair) {
    const researcherKey = await testKeyPair()
    const registered = { publicKey: Buffer.from(researcherKey.publicKey), fingerprint: researcherKey.fingerprint }
    await db
        .insertInto('userPublicKey')
        .values({ userId: researcherId, ...registered })
        .onConflict((oc) => oc.column('userId').doUpdateSet(registered))
        .execute()

    const entries = await new ResultsReader(zip, enclaveKey.privateKey, enclaveKey.fingerprint).extractFilesWithKeys()
    const wrapped = await Promise.all(
        entries.map(async (entry) => ({
            studyJobFileId,
            filePath: entry.path,
            fingerprint: researcherKey.fingerprint,
            crypt: await wrapAesKey(entry.rawAesKey, researcherKey.publicKey),
        })),
    )
    await db.insertInto('studyJobFileRecipientKey').values(wrapped).execute()
}
