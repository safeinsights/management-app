import {
    act,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    readTestSupportFile,
    renderHook,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, generateKeyPair, pemToArrayBuffer } from 'si-encryption/util'
import { DecryptionError, KeyParseError, ResultsIntegrityFailure, useDecryptFiles } from './use-decrypt-files'
import type { EncryptedJobFile } from './use-decrypt-files'

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/**
 * Build one encrypted artifact the way the trusted-output-app would. `recipient` defaults to the
 * test keypair, so the key the reviewer pastes is a genuine manifest recipient; pass a foreign
 * public key to model a reviewer whose key was never a recipient at all.
 */
async function buildArtifact(recipient?: { publicKey: ArrayBuffer; fingerprint: string }): Promise<EncryptedJobFile> {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const to = recipient ?? { publicKey, fingerprint: await fingerprintKeyData(publicKey) }

    const writer = new ResultsWriter([to])
    await writer.addFile('result.csv', toArrayBuffer('col1,col2\n1,2'))
    const zip = await writer.generate()

    return {
        studyJobFileId: 'artifact-1',
        fileType: 'ENCRYPTED-RESULT',
        name: 'encrypted-results.zip',
        encryptedBody: await zip.arrayBuffer(),
        recipientKeys: {},
    }
}

/** Truncate the archive, as a storage-layer corruption or a hostile trim would. */
function corrupt(artifact: EncryptedJobFile): EncryptedJobFile {
    const bytes = new Uint8Array(artifact.encryptedBody)
    return { ...artifact, encryptedBody: bytes.slice(0, bytes.byteLength - 64).buffer }
}

type HookResult = ReturnType<typeof useDecryptFiles>

async function decryptWith(
    encryptedFiles: EncryptedJobFile[],
    privateKey: string,
    onError: (err: Error) => void,
): Promise<{ result: { current: HookResult }; caught: Error[] }> {
    const caught: Error[] = []
    const settled = vi.fn()
    const handler = (err: Error) => {
        caught.push(err)
        settled()
        onError(err)
    }

    const { result } = renderHook(() => useDecryptFiles({ encryptedFiles, onSuccess: settled, onError: handler }), {
        wrapper: createTestQueryWrapper(),
    })

    act(() => result.current.decrypt(privateKey))
    // Wait on the mutation actually settling. isPending is false before it starts, so waiting for
    // it to go false passes immediately and asserts against a run that never happened.
    await waitFor(() => expect(settled).toHaveBeenCalled())

    return { result, caught }
}

describe('useDecryptFiles error classification', () => {
    it('reports a key that was never a recipient as a key problem', async () => {
        // The manifest names a different keypair, so the reviewer's fingerprint is absent — the one
        // failure their key genuinely explains.
        const foreign = await generateKeyPair()
        const artifact = await buildArtifact({
            publicKey: foreign.exportedPublicKey,
            fingerprint: foreign.fingerprint,
        })
        const onError = vi.fn()

        const { result, caught } = await decryptWith([artifact], await readTestSupportFile('private_key.pem'), onError)

        expect(caught[0]).toBeInstanceOf(DecryptionError)
        expect(result.current.form.errors.privateKey).toMatch(/not valid for these results/i)
    })

    it('reports a corrupted archive as an integrity failure, not a bad key', async () => {
        const artifact = corrupt(await buildArtifact())
        const onError = vi.fn()

        const { result, caught } = await decryptWith([artifact], await readTestSupportFile('private_key.pem'), onError)

        expect(caught[0]).toBeInstanceOf(ResultsIntegrityFailure)
        expect(caught[0].message).toMatch(/could not be verified/i)
        // Not a problem with the value in the key field, so it must not be shown as one — that is
        // what told reviewers to re-paste their key and retry a tampered archive.
        expect(result.current.form.errors.privateKey).toBeUndefined()
    })

    it('surfaces an integrity failure even when the caller supplies its own onError', async () => {
        vi.mocked(notifications.show).mockClear()
        const artifact = corrupt(await buildArtifact())

        await decryptWith([artifact], await readTestSupportFile('private_key.pem'), vi.fn())

        // An onError used to suppress reporting entirely, so the security signal reached nothing.
        expect(notifications.show).toHaveBeenCalled()
    })

    it('does not report an ordinary wrong key when the caller handles it', async () => {
        vi.mocked(notifications.show).mockClear()
        const foreign = await generateKeyPair()
        const artifact = await buildArtifact({
            publicKey: foreign.exportedPublicKey,
            fingerprint: foreign.fingerprint,
        })

        await decryptWith([artifact], await readTestSupportFile('private_key.pem'), vi.fn())

        // A mistyped key is a user mistake, not a telemetry event.
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('still reports an unparseable key as a key-parse problem', async () => {
        const artifact = await buildArtifact()

        const { caught } = await decryptWith([artifact], 'not a pem at all', vi.fn())

        expect(caught[0]).toBeInstanceOf(KeyParseError)
    })

    it('decrypts a sound archive with the right key', async () => {
        const artifact = await buildArtifact()
        const privateKey = await readTestSupportFile('private_key.pem')
        const onSuccess = vi.fn()

        const { result } = renderHook(() => useDecryptFiles({ encryptedFiles: [artifact], onSuccess }), {
            wrapper: createTestQueryWrapper(),
        })

        act(() => result.current.decrypt(privateKey))
        await waitFor(() => expect(onSuccess).toHaveBeenCalled())

        const [files] = onSuccess.mock.calls[0]
        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('result.csv')
    })
})
