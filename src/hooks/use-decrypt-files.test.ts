import {
    createTestQueryWrapper,
    describe,
    expect,
    faker,
    it,
    readTestSupportFile,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { wrapAesKey } from 'si-encryption/job-results/crypto'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { flipByte, openArchive, packArchive, tamper, writeLegacyCbcArchive } from 'si-encryption/testing/archive'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import type { JobFileInfo } from '@/lib/types'
import { ArchiveIntegrityError, useDecryptFiles, type EncryptedJobFile } from './use-decrypt-files'

const FILENAME = 'results.csv'
const CONTENTS = 'participant_count,mean_score\n4128,72.4\n'
const JOB_ID = '0193a1f0-0000-7000-8000-000000000001'
const OTHER_JOB_ID = '0193a1f0-0000-7000-8000-000000000002'
const OTHER_PRIVATE_KEY = 'invalid_private_key.pem'

const toArrayBuffer = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

const recipient = async (publicKeyFile = 'public_key.pem') => {
    const publicKey = pemToArrayBuffer(await readTestSupportFile(publicKeyFile))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

const asJobFile = async (archive: Blob): Promise<EncryptedJobFile> => ({
    studyJobFileId: faker.string.uuid(),
    fileType: 'ENCRYPTED-RESULT',
    name: 'results.zip',
    encryptedBody: await archive.arrayBuffer(),
    recipientKeys: {},
})

const decrypt = async (file: EncryptedJobFile, privateKeyFile = 'private_key.pem') => {
    let decrypted: JobFileInfo[] | undefined
    let failure: Error | undefined

    const { result } = renderHook(
        () =>
            useDecryptFiles({
                encryptedFiles: [file],
                jobId: JOB_ID,
                onSuccess: (files) => {
                    decrypted = files
                },
                onError: (err) => {
                    failure = err
                },
            }),
        { wrapper: createTestQueryWrapper() },
    )

    result.current.decrypt(await readTestSupportFile(privateKeyFile))
    await waitFor(() => expect(decrypted ?? failure).toBeDefined())
    if (failure) throw failure

    return decrypted as JobFileInfo[]
}

const currentArchive = async (options: { jobId?: string } = { jobId: JOB_ID }) => {
    const writer = new ResultsWriter([await recipient()], options)
    await writer.addFile(FILENAME, toArrayBuffer(CONTENTS))
    return writer.generate()
}

// The reviewer's AES keys re-wrapped for the other key pair, the way approval grants a researcher access.
const researcherJobFile = async () => {
    const archive = await currentArchive()
    const reviewerKey = pemToArrayBuffer(await readTestSupportFile('private_key.pem'))
    const reviewer = new ResultsReader(archive, reviewerKey, (await recipient()).fingerprint)
    const { publicKey } = await recipient('invalid_public_key.pem')

    const recipientKeys: Record<string, string> = {}
    for (const entry of await reviewer.extractFilesWithKeys()) {
        recipientKeys[entry.path] = await wrapAesKey(entry.rawAesKey, publicKey)
    }
    return { ...(await asJobFile(archive)), recipientKeys }
}

const expectDecryptsToContents = (files: JobFileInfo[]) => {
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(FILENAME)
    expect(new TextDecoder().decode(new Uint8Array(files[0].contents))).toBe(CONTENTS)
}

describe('useDecryptFiles', () => {
    it('refuses a legacy AES-CBC archive as tampering', async () => {
        const archive = await writeLegacyCbcArchive([await recipient()], { [FILENAME]: toArrayBuffer(CONTENTS) })

        // Pins the fixture: a manifest that gained a cipher would be refused for another reason.
        const { manifest } = await openArchive(archive)
        expect(manifest.cipher).toBeUndefined()
        expect(manifest.version).toBeUndefined()

        await expect(decrypt(await asJobFile(archive))).rejects.toThrow(ArchiveIntegrityError)
    })

    it('refuses a current archive whose manifest is downgraded to claim AES-CBC', async () => {
        const { manifest, bodies } = await openArchive(await currentArchive())
        const downgraded = await packArchive({ ...manifest, cipher: 'AES-CBC' }, bodies)

        await expect(decrypt(await asJobFile(downgraded))).rejects.toThrow(ArchiveIntegrityError)
    })

    it('reads a current archive', async () => {
        expectDecryptsToContents(await decrypt(await asJobFile(await currentArchive())))
    })

    it('reads a current archive through keys re-wrapped for a researcher', async () => {
        expectDecryptsToContents(await decrypt(await researcherJobFile(), OTHER_PRIVATE_KEY))
    })

    it('reports a key the archive was not written for as a bad key rather than tampering', async () => {
        await expect(decrypt(await asJobFile(await currentArchive()), OTHER_PRIVATE_KEY)).rejects.toThrow(
            'Private key is not valid for these results',
        )
    })

    it('reports a key the re-wrapped keys do not open as a bad key rather than tampering', async () => {
        await expect(decrypt(await researcherJobFile())).rejects.toThrow('Private key is not valid for these results')
    })

    it('reports a dropped file as tampering rather than a bad key', async () => {
        const archive = await tamper(await currentArchive(), { drop: [FILENAME] })

        await expect(decrypt(await asJobFile(archive))).rejects.toThrow(ArchiveIntegrityError)
    })

    it('reports a tampered file body as tampering rather than a bad key', async () => {
        const { manifest, bodies } = await openArchive(await currentArchive())
        const corrupted = await packArchive(manifest, [{ ...bodies[0], blob: await flipByte(bodies[0].blob) }])

        await expect(decrypt(await asJobFile(corrupted))).rejects.toThrow(ArchiveIntegrityError)
    })

    it('refuses an archive belonging to a different job', async () => {
        const archive = await currentArchive({ jobId: OTHER_JOB_ID })

        await expect(decrypt(await asJobFile(archive))).rejects.toThrow(ArchiveIntegrityError)
    })

    // The TOA must start writing a job id in the same release: once it emits GCM, an unbound
    // archive is refused outright rather than read as belonging to whichever job asked (OTTER-782).
    it('refuses a current archive bound to no job at all', async () => {
        const archive = await currentArchive({})

        await expect(decrypt(await asJobFile(archive))).rejects.toThrow(ArchiveIntegrityError)
    })
})
