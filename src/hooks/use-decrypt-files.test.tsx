import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
} from '@/tests/unit.helpers'
import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { latestJobForStudy } from '@/server/db/queries'
import { insertSharedFileKeys } from '@/server/results-sharing'
import { fetchFileContents } from '@/server/storage'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { generateKeyPair } from 'si-encryption/util/keypair'

// Only the object-store read is mocked: the ciphertext is real, and so is every step between it and
// the screen (fetchEncryptedJobFilesAction, the recipient-key lookup, ResultsReader, the panel).
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(),
}))

const KEY_PLACEHOLDER = 'Enter your Results Key to access encrypted content.'
const MISMATCH_MESSAGE = 'Private key is not valid for these results, check with your administrator'

// The researcher's own pair, generated once because RSA-4096 keygen is the slowest thing here. It is
// deliberately NOT the shared fixture pair every seeded user holds: a researcher who shares the
// enclave's key is a manifest recipient by accident, and would pass this suite without the
// recipient-key path ever running.
const researcher = await generateKeyPair()
const researcherPrivateKeyPem = `-----BEGIN PRIVATE KEY-----\n${researcher.privateKeyString}\n-----END PRIVATE KEY-----`

// The enclave writes the manifest against the reviewing org's keys, which is the fixture pair here.
const enclaveRecipient = async () => {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// One encrypted artifact as TOA produces it: whole zip, embedded manifest, keys for the enclave only.
async function encryptForEnclave(files: { name: string; content: string }[]) {
    const recipient = await enclaveRecipient()
    const writer = new ResultsWriter([recipient])
    for (const file of files) await writer.addFile(file.name, toArrayBuffer(file.content))
    return await writer.generate()
}

// What the reviewer's browser holds after decrypting: each inner file's raw AES key, the input the
// approval flow re-wraps from.
async function reviewerReads(zip: Blob) {
    const recipient = await enclaveRecipient()
    const privateKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
    return await new ResultsReader(zip, privateKey, recipient.fingerprint).extractFilesWithKeys()
}

function serveCiphertext(zip: Blob) {
    vi.mocked(fetchFileContents).mockResolvedValue(zip)
}

/**
 * A lab study whose latest job holds one encrypted artifact, with the session set to a researcher of
 * that lab who has their own enrolled key. Mirrors production: the researcher is absent from the
 * manifest, so their only way in is a wrapped key row.
 */
async function setupSharedArtifact(files: { name: string; content: string }[]) {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    await db
        .insertInto('userPublicKey')
        .values({
            userId: user.id,
            publicKey: Buffer.from(researcher.exportedPublicKey),
            fingerprint: researcher.fingerprint,
        })
        .executeTakeFirstOrThrow()

    const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()

    const zip = await encryptForEnclave(files)
    const row = await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name: 'encrypted-logs.zip',
            path: `${org.slug}/${job.id}/results/encrypted-logs.zip`,
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { study, job, zip, studyJobFileId: row.id }
}

// The one line buildSharedFiles runs per recipient, kept here rather than calling it because that
// action is gated on 'approve Study' and belongs to the reviewer's session, not the researcher's.
async function shareWithResearcher(
    jobId: string,
    studyJobFileId: string,
    entries: { path: string; rawAesKey: ArrayBuffer }[],
) {
    const sharedFiles = await Promise.all(
        entries.map(async (entry) => ({
            studyJobFileId,
            filePath: entry.path,
            keys: [{ fingerprint: researcher.fingerprint, crypt: await wrapAesKey(entry.rawAesKey, researcher.exportedPublicKey) }], // prettier-ignore
        })),
    )
    await insertSharedFileKeys(db, jobId, sharedFiles)
}

async function renderResearcherPanel(studyId: string) {
    const job = await latestJobForStudy(studyId)
    renderWithProviders(<EncryptedFilesPanel isReviewer={false} job={job} onFilesApproved={vi.fn()} />)
    await waitFor(() => expect(screen.getByPlaceholderText(KEY_PLACEHOLDER)).toBeDefined())
}

function decryptWith(privateKeyPem: string) {
    fireEvent.change(screen.getByPlaceholderText(KEY_PLACEHOLDER), { target: { value: privateKeyPem } })
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))
}

describe('researcher decryption of re-wrapped artifacts', () => {
    // The gap this closes: every other test of this path asserts on placeholder crypt strings, so a
    // real researcher unwrap - the splice of recipient keys into a manifest they are not named in -
    // had no coverage at all and only ever ran on a deployed environment.
    it('decrypts an artifact whose keys were re-wrapped for a key absent from the manifest', async () => {
        const { study, job, zip, studyJobFileId } = await setupSharedArtifact([
            { name: 'logs.json', content: '{"error":"Execution halted"}' },
        ])
        await shareWithResearcher(job.id, studyJobFileId, await reviewerReads(zip))
        serveCiphertext(zip)

        await renderResearcherPanel(study.id)
        decryptWith(researcherPrivateKeyPem)

        await waitFor(() => expect(screen.getByText('logs.json')).toBeDefined())
        expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
        expect(screen.queryByText(MISMATCH_MESSAGE)).toBeNull()
    })

    // Recipient rows are found by the fingerprint enrolled for the user, while the browser splices them
    // in under the fingerprint of the key that was typed. A key that is not the enrolled one therefore
    // gets as far as unwrapping and fails there, which is the message a researcher actually sees when
    // their account's enrolled key and the key they hold have drifted apart.
    it('reports a mismatch when the typed key is not the enrolled one', async () => {
        const { study, job, zip, studyJobFileId } = await setupSharedArtifact([
            { name: 'logs.json', content: '{"error":"Execution halted"}' },
        ])
        await shareWithResearcher(job.id, studyJobFileId, await reviewerReads(zip))
        serveCiphertext(zip)

        await renderResearcherPanel(study.id)
        decryptWith(await readTestSupportFile('private_key.pem'))

        await waitFor(() => expect(screen.getByText(MISMATCH_MESSAGE)).toBeDefined())
        expect(screen.queryByText('logs.json')).toBeNull()
    })

    // What a re-delivery used to do to a researcher: the reviewer wrapped the AES keys of the copy their
    // browser had read, a retry replaced the object, and the keys then described bytes that were gone.
    // The artifact still lists and the key is still theirs, so the failure is indistinguishable from a
    // wrong key - which is why storeJobFile refusing the replacement is the fix, not a better message.
    //
    // The superseded copy renames its inner file, so the manifest lookup misses deterministically. A
    // same-name replacement fails on AES padding instead, which the cipher does not guarantee to detect.
    it('fails when the wrapped keys describe a superseded copy of the ciphertext', async () => {
        const { study, job, zip, studyJobFileId } = await setupSharedArtifact([
            { name: 'logs.json', content: '{"error":"Execution halted"}' },
        ])
        await shareWithResearcher(job.id, studyJobFileId, await reviewerReads(zip))
        serveCiphertext(await encryptForEnclave([{ name: 'logs-retry.json', content: '{"error":"same run, again"}' }]))

        await renderResearcherPanel(study.id)
        decryptWith(researcherPrivateKeyPem)

        await waitFor(() => expect(screen.getByText(MISMATCH_MESSAGE)).toBeDefined())
    })
})
