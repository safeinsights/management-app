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
import { openArchive, writeLegacyCbcArchive } from 'si-encryption/testing/archive'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import type { JobFileInfo } from '@/lib/types'
import { useDecryptFiles, type EncryptedJobFile } from './use-decrypt-files'

const FILENAME = 'results.csv'
const CONTENTS = 'participant_count,mean_score\n4128,72.4\n'

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

const decrypt = async (file: EncryptedJobFile) => {
    let decrypted: JobFileInfo[] | undefined
    let failure: Error | undefined

    const { result } = renderHook(
        () =>
            useDecryptFiles({
                encryptedFiles: [file],
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
        const writer = new ResultsWriter([await recipient()])
        await writer.addFile(FILENAME, toArrayBuffer(CONTENTS))

        expectDecryptsToContents(await decrypt(await asJobFile(await writer.generate())))
    })
})
