import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
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
 * A read that failed for a reason the reviewer's key cannot explain — a corrupted or tampered
 * archive, a manifest that disagrees with the zip, a wrapped key that does not open.
 *
 * Kept distinct from {@link DecryptionError} because the two demand opposite responses: a key
 * mistake is fixed by re-entering the key, while this one must not be retried at all.
 */
export class ResultsIntegrityFailure extends Error {}

const INTEGRITY_MESSAGE =
    'These results could not be verified and were not decrypted. Do not approve them — contact your administrator.'

/** si-encryption's signal that this fingerprint is absent from the manifest's recipient list. */
const NOT_A_RECIPIENT = /key signature/i

/**
 * Decide whether a failed read is explained by the key that was supplied.
 *
 * Only a fingerprint missing from the manifest is a real key mistake. Everything else is not: the
 * manifest named this exact key as a recipient, so the AES key was wrapped for it and should open.
 * When it doesn't, the archive has changed since it was written — and telling the reviewer to
 * re-check their key sends them to retry a tampered archive instead of escalating it.
 */
function isIntegrityFailure(err: unknown): boolean {
    if (!(err instanceof Error)) return true
    // Matched by name rather than instanceof so it still works once the si-encryption pin carries
    // ResultsIntegrityError, without this file needing to import a symbol it may not have yet.
    if (err.name === 'ResultsIntegrityError') return true
    return !NOT_A_RECIPIENT.test(err.message)
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
    try {
        const files: JobFileInfo[] = []
        for (const artifact of encryptedFiles) {
            const reader = new ResultsReader(
                new Blob([artifact.encryptedBody]),
                privateKeyBuffer,
                fingerprint,
                artifact.recipientKeys,
            )
            // Capture each inner file's raw AES key so approval can re-wrap it per researcher.
            const entries = await reader.extractFilesWithKeys()
            for (const entry of entries) {
                files.push({
                    path: entry.path,
                    contents: entry.contents,
                    rawAesKey: entry.rawAesKey,
                    sourceId: artifact.studyJobFileId,
                    // Encrypted type -> approved form; an already-approved input keeps its type.
                    fileType: ENCRYPTED_TO_APPROVED[artifact.fileType] ?? artifact.fileType,
                })
            }
        }
        return files
    } catch (err) {
        if (isIntegrityFailure(err)) {
            throw new ResultsIntegrityFailure(INTEGRITY_MESSAGE, { cause: err })
        }
        throw new DecryptionError('Private key is not valid for these results, check with your administrator', {
            cause: err,
        })
    }
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

    const handleError = (err: Error) => {
        const isIntegrity = err instanceof ResultsIntegrityFailure

        // An integrity failure is reported even when the caller handles it: it is a security signal
        // about the data, not a user mistake, and a caller-supplied onError used to swallow it
        // entirely. A mistyped key stays unreported unless nothing else is listening.
        if (isIntegrity || !onError) {
            reportMutationError(isIntegrity ? 'results failed integrity check' : 'decryption failed')(err)
        }

        // Only key problems belong on the key field. Attaching an integrity failure there framed
        // tampered results as a typo and invited a retry.
        if (err instanceof KeyParseError || err instanceof DecryptionError) {
            form.setFieldError('privateKey', err.message)
        }

        onError?.(err)
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
