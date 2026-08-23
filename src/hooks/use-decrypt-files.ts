import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
import * as Sentry from '@sentry/nextjs'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileType } from '@/database/types'

// One encrypted artifact from fetchEncryptedJobFilesAction: whole-zip ciphertext (embedded
// manifest). `recipientKeys` (inner path -> wrapped AES key) is set only for lab researchers, who
// aren't manifest recipients; ResultsReader merges them into the manifest under their fingerprint.
// Empty for enclave reviewers, who decrypt with their own key.
export type EncryptedJobFile = {
    studyJobFileId: string
    fileType: FileType
    name: string
    encryptedBody: ArrayBuffer
    recipientKeys: Record<string, string>
}

export class KeyParseError extends Error {}
export class DecryptionError extends Error {}

/**
 * A read that failed for a reason the supplied key cannot explain — a corrupted or tampered
 * archive, a manifest that disagrees with the zip, a wrapped key that does not open.
 *
 * Kept distinct from {@link DecryptionError} because the two demand opposite responses: a key
 * mistake is fixed by re-entering the key, while this one must not be retried at all.
 */
export class ResultsIntegrityFailure extends Error {}

const INTEGRITY_MESSAGE =
    'These results could not be verified and were not decrypted. Do not approve them — contact your administrator.'

const WRONG_KEY_MESSAGE = 'Private key is not valid for these results, check with your administrator'

/**
 * Decrypt one artifact, attributing any failure structurally rather than by error message
 * (si-encryption throws untyped Errors, so their text is not a contract):
 *
 * - The archive fails to parse: the key was never used, so the failure cannot be a key mistake.
 * - Reviewer shape (no wrapped keys): the embedded manifest is authoritative. A fingerprint it
 *   never named is a wrong key; a named recipient whose wrapped key then fails to open means the
 *   archive changed since it was written.
 * - Researcher shape (wrapped keys): decode() splices the keys into the manifest under whatever
 *   fingerprint the pasted key hashes to, so manifest membership cannot authenticate the key.
 *   The keys were wrapped for the researcher's registered key, which makes a failed read
 *   indistinguishable from pasting a different key — the far likelier cause, so it is reported
 *   as one.
 */
async function decryptArtifact(
    artifact: EncryptedJobFile,
    privateKeyBuffer: ArrayBuffer,
    fingerprint: string,
): Promise<JobFileInfo[]> {
    const reader = new ResultsReader(
        new Blob([artifact.encryptedBody]),
        privateKeyBuffer,
        fingerprint,
        artifact.recipientKeys,
    )

    try {
        await reader.decode()
    } catch (err) {
        throw new ResultsIntegrityFailure(INTEGRITY_MESSAGE, { cause: err })
    }

    const holdsWrappedKeys = Object.keys(artifact.recipientKeys).length > 0
    const isManifestRecipient = Object.values(reader.manifest.files).some((file) => file.keys[fingerprint])
    if (!holdsWrappedKeys && !isManifestRecipient) {
        throw new DecryptionError(WRONG_KEY_MESSAGE)
    }

    try {
        // Capture each inner file's raw AES key so approval can re-wrap it per researcher.
        const entries = await reader.extractFilesWithKeys()
        return entries.map((entry) => ({
            path: entry.path,
            contents: entry.contents,
            rawAesKey: entry.rawAesKey,
            sourceId: artifact.studyJobFileId,
            // Encrypted type -> approved form; an already-approved input keeps its type.
            fileType: ENCRYPTED_TO_APPROVED[artifact.fileType] ?? artifact.fileType,
        }))
    } catch (err) {
        if (holdsWrappedKeys) {
            throw new DecryptionError(WRONG_KEY_MESSAGE, { cause: err })
        }
        throw new ResultsIntegrityFailure(INTEGRITY_MESSAGE, { cause: err })
    }
}

async function decryptFiles(encryptedFiles: EncryptedJobFile[], privateKey: string): Promise<JobFileInfo[]> {
    let fingerprint = ''
    let privateKeyBuffer: ArrayBuffer
    try {
        privateKeyBuffer = pemToArrayBuffer(privateKey)
        const key = await privateKeyFromBuffer(privateKeyBuffer)
        fingerprint = await fingerprintPublicKeyFromPrivateKey(key)
    } catch (err) {
        throw new KeyParseError('Invalid key data, check that key was copied successfully', { cause: err })
    }

    const files: JobFileInfo[] = []
    for (const artifact of encryptedFiles) {
        files.push(...(await decryptArtifact(artifact, privateKeyBuffer, fingerprint)))
    }
    return files
}

export function useDecryptFiles(options: {
    encryptedFiles: EncryptedJobFile[] | undefined
    onSuccess: (files: JobFileInfo[]) => void
    onError?: (err: Error) => void
}) {
    const { encryptedFiles, onSuccess, onError } = options

    const form = useForm({
        mode: 'uncontrolled' as const,
        initialValues: { privateKey: '' },
        validate: {
            privateKey: isNotEmpty('Required'),
        },
        validateInputOnChange: true,
    })

    // An integrity failure is a security signal about the data, not a user mistake, so it reaches
    // telemetry even when the caller presents the failure itself. Presentation stays on a single
    // user-facing channel: the caller's, or failing that, a notification — never the key field,
    // which framed tampered results as a typo and invited a retry.
    const handleIntegrityFailure = (err: ResultsIntegrityFailure) => {
        if (onError) {
            Sentry.captureException(err)
            onError(err)
        } else {
            reportMutationError('results failed integrity check')(err)
        }
    }

    const handleError = (err: Error) => {
        if (err instanceof ResultsIntegrityFailure) {
            handleIntegrityFailure(err)
            return
        }
        if (onError) {
            onError(err)
            return
        }
        form.setFieldError('privateKey', err.message)
    }

    const { mutate, isPending } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!encryptedFiles) return []
            return decryptFiles(encryptedFiles, privateKey)
        },
        onSuccess,
        onError: handleError,
    })

    const decrypt = (privateKey: string) => mutate({ privateKey })

    return { decrypt, isPending, form }
}
