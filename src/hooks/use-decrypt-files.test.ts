import { vi } from 'vitest'
import {
    act,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    readTestSupportFile,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, generateKeyPair, pemToArrayBuffer } from 'si-encryption/util'
import { DecryptionError, KeyParseError, ResultsIntegrityFailure, useDecryptFiles } from './use-decrypt-files'
import type { EncryptedJobFile } from './use-decrypt-files'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    captureException: vi.fn(),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

type Recipient = { publicKey: ArrayBuffer; fingerprint: string }

async function testRecipient(): Promise<Recipient> {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    return { publicKey, fingerprint: await fingerprintKeyData(publicKey) }
}

/**
 * Build one encrypted artifact the way the trusted-output-app would. Recipients default to the
 * test keypair, so the key the reviewer pastes is a genuine manifest recipient; pass a foreign
 * public key to model a reviewer whose key was never a recipient at all.
 */
async function buildArtifact(recipients?: Recipient[]): Promise<EncryptedJobFile> {
    const to = recipients ?? [await testRecipient()]

    const writer = new ResultsWriter(to)
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

/**
 * Pull the wrapped AES keys for one fingerprint back out of an artifact's embedded manifest —
 * the same per-path map fetchEncryptedJobFilesAction serves a researcher, whose access comes from
 * these rows rather than from being named in the manifest.
 */
async function wrappedKeysFor(artifact: EncryptedJobFile, fingerprint: string): Promise<Record<string, string>> {
    const probe = new ResultsReader(new Blob([artifact.encryptedBody]), new ArrayBuffer(0), '')
    await probe.decode()
    const keys: Record<string, string> = {}
    for (const file of Object.values(probe.manifest.files)) {
        const wrapped = file.keys[fingerprint]
        if (wrapped) keys[file.path] = wrapped.crypt
    }
    return keys
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
): Promise<{ result: { current: HookResult }; caught: Error[] }> {
    const caught: Error[] = []
    const settled = vi.fn()
    const handler = (err: Error) => {
        caught.push(err)
        settled()
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
        const artifact = await buildArtifact([
            { publicKey: foreign.exportedPublicKey, fingerprint: foreign.fingerprint },
        ])

        const { caught } = await decryptWith([artifact], await readTestSupportFile('private_key.pem'))

        expect(caught[0]).toBeInstanceOf(DecryptionError)
    })

    it('reports a researcher wrong key as a key problem, not an integrity failure', async () => {
        // A researcher's artifact: the manifest names only the reviewer, and access comes from
        // wrapped keys that were wrapped for the researcher's *registered* key. Pasting a
        // different, syntactically valid key fails the unwrap — a key mistake, not tampering.
        const foreign = await generateKeyPair()
        const reviewer = { publicKey: foreign.exportedPublicKey, fingerprint: foreign.fingerprint }
        const artifact = await buildArtifact([reviewer])
        const recipientKeys = await wrappedKeysFor(artifact, foreign.fingerprint)

        const { caught } = await decryptWith(
            [{ ...artifact, recipientKeys }],
            await readTestSupportFile('private_key.pem'),
        )

        expect(caught[0]).toBeInstanceOf(DecryptionError)
    })

    it('decrypts for a researcher whose access comes from wrapped keys', async () => {
        const foreign = await generateKeyPair()
        const reviewer = { publicKey: foreign.exportedPublicKey, fingerprint: foreign.fingerprint }
        const me = await testRecipient()
        const artifact = await buildArtifact([reviewer, me])
        const recipientKeys = await wrappedKeysFor(artifact, me.fingerprint)
        const privateKey = await readTestSupportFile('private_key.pem')
        const onSuccess = vi.fn()

        const { result } = renderHook(
            () => useDecryptFiles({ encryptedFiles: [{ ...artifact, recipientKeys }], onSuccess }),
            { wrapper: createTestQueryWrapper() },
        )

        act(() => result.current.decrypt(privateKey))
        await waitFor(() => expect(onSuccess).toHaveBeenCalled())

        const [files] = onSuccess.mock.calls[0]
        expect(files).toHaveLength(1)
        expect(files[0].path).toBe('result.csv')
    })

    it('reports a corrupted archive as an integrity failure, not a bad key', async () => {
        const artifact = corrupt(await buildArtifact())

        const { result, caught } = await decryptWith([artifact], await readTestSupportFile('private_key.pem'))

        expect(caught[0]).toBeInstanceOf(ResultsIntegrityFailure)
        expect(caught[0].message).toMatch(/could not be verified/i)
        // Not a problem with the value in the key field, so it must not be shown as one — that is
        // what told reviewers to re-paste their key and retry a tampered archive.
        expect(result.current.form.errors.privateKey).toBeUndefined()
    })

    it('records an integrity failure in Sentry without a second user-facing message', async () => {
        vi.mocked(notifications.show).mockClear()
        vi.mocked(Sentry.captureException).mockClear()
        const artifact = corrupt(await buildArtifact())

        const { caught } = await decryptWith([artifact], await readTestSupportFile('private_key.pem'))

        // The caller presents the failure; the security signal still reaches telemetry, but not a
        // duplicate notification alongside the caller's own message.
        expect(caught[0]).toBeInstanceOf(ResultsIntegrityFailure)
        expect(Sentry.captureException).toHaveBeenCalledWith(caught[0])
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('notifies on an integrity failure when no caller is listening', async () => {
        vi.mocked(notifications.show).mockClear()
        const artifact = corrupt(await buildArtifact())
        const privateKey = await readTestSupportFile('private_key.pem')
        const onSuccess = vi.fn()

        const { result } = renderHook(() => useDecryptFiles({ encryptedFiles: [artifact], onSuccess }), {
            wrapper: createTestQueryWrapper(),
        })
        act(() => result.current.decrypt(privateKey))
        await waitFor(() => expect(notifications.show).toHaveBeenCalled())

        // Still not a key-field problem.
        expect(result.current.form.errors.privateKey).toBeUndefined()
    })

    it('does not report an ordinary wrong key when the caller handles it', async () => {
        vi.mocked(notifications.show).mockClear()
        const foreign = await generateKeyPair()
        const artifact = await buildArtifact([
            { publicKey: foreign.exportedPublicKey, fingerprint: foreign.fingerprint },
        ])

        await decryptWith([artifact], await readTestSupportFile('private_key.pem'))

        // A mistyped key is a user mistake, not a telemetry event.
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('sets the key field error when no caller handles a wrong key', async () => {
        vi.mocked(notifications.show).mockClear()
        const foreign = await generateKeyPair()
        const artifact = await buildArtifact([
            { publicKey: foreign.exportedPublicKey, fingerprint: foreign.fingerprint },
        ])
        const privateKey = await readTestSupportFile('private_key.pem')
        const onSuccess = vi.fn()

        const { result } = renderHook(() => useDecryptFiles({ encryptedFiles: [artifact], onSuccess }), {
            wrapper: createTestQueryWrapper(),
        })
        act(() => result.current.decrypt(privateKey))

        await waitFor(() => expect(result.current.form.errors.privateKey).toMatch(/not valid for these results/i))
        // The field error is the one channel; no notification stacked on top of it.
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('still reports an unparseable key as a key-parse problem', async () => {
        const artifact = await buildArtifact()

        const { caught } = await decryptWith([artifact], 'not a pem at all')

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
