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
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { flipByte, openArchive, packArchive, tamper, writeLegacyCbcArchive } from 'si-encryption/testing/archive'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import type { JobFileInfo } from '@/lib/types'
import { ArchiveIntegrityError, useDecryptFiles, type EncryptedJobFile } from './use-decrypt-files'

const FILENAME = 'results.csv'
const CONTENTS = 'participant_count,mean_score\n4128,72.4\n'
const JOB_ID = '0193a1f0-0000-7000-8000-000000000001'
const OTHER_JOB_ID = '0193a1f0-0000-7000-8000-000000000002'

const toArrayBuffer = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

const recipient = async () => {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

const asJobFile = async (archive: Blob): Promise<EncryptedJobFile> => ({
    studyJobFileId: faker.string.uuid(),
    fileType: 'ENCRYPTED-RESULT',
    name: 'results.zip',
    encryptedBody: await archive.arrayBuffer(),
    recipientKeys: {},
})

const decrypt = async (file: EncryptedJobFile, jobId = JOB_ID) => {
    let decrypted: JobFileInfo[] | undefined
    let failure: Error | undefined

    const { result } = renderHook(
        () =>
            useDecryptFiles({
                encryptedFiles: [file],
                jobId,
                onSuccess: (files) => {
                    decrypted = files
                },
                onError: (err) => {
                    failure = err
                },
            }),
        { wrapper: createTestQueryWrapper() },
    )

    result.current.decrypt(await readTestSupportFile('private_key.pem'))
    await waitFor(() => expect(decrypted ?? failure).toBeDefined())
    if (failure) throw failure

    return decrypted as JobFileInfo[]
}

const currentArchive = async (options: { jobId?: string } = { jobId: JOB_ID }) => {
    const writer = new ResultsWriter([await recipient()], options)
    await writer.addFile(FILENAME, toArrayBuffer(CONTENTS))
    return writer.generate()
}

const expectDecryptsToContents = (files: JobFileInfo[]) => {
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe(FILENAME)
    expect(new TextDecoder().decode(new Uint8Array(files[0].contents))).toBe(CONTENTS)
}

describe('useDecryptFiles', () => {
    it('reads a legacy AES-CBC archive written before the manifest carried a cipher', async () => {
        const archive = await writeLegacyCbcArchive([await recipient()], { [FILENAME]: toArrayBuffer(CONTENTS) })

        // Pins the fixture: a manifest that gained a cipher would silently make this a second
        // current-format test.
        const { manifest } = await openArchive(archive)
        expect(manifest.cipher).toBeUndefined()
        expect(manifest.version).toBeUndefined()

        expectDecryptsToContents(await decrypt(await asJobFile(archive)))
    })

    it('reads a current archive', async () => {
        expectDecryptsToContents(await decrypt(await asJobFile(await currentArchive())))
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
