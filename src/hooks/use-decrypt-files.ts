import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
import { ResultsReader, ResultsIntegrityError, type DecryptedEntry } from 'si-encryption/job-results/reader'
import { LEGACY_CIPHER } from 'si-encryption/job-results/crypto'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileType } from '@/database/types'

// `recipientKeys` is set only for lab researchers, who are not manifest recipients, and is empty
// for enclave reviewers, who decrypt with their own key.
export type EncryptedJobFile = {
    studyJobFileId: string
    fileType: FileType
    name: string
    encryptedBody: ArrayBuffer
    recipientKeys: Record<string, string>
}

class KeyParseError extends Error {}
class DecryptionError extends Error {}

export class ArchiveIntegrityError extends Error {}

export const ARCHIVE_INTEGRITY_MESSAGE =
    'These results failed verification and may have been altered. Contact your administrator.'

async function readArchive(
    artifact: EncryptedJobFile,
    privateKey: ArrayBuffer,
    fingerprint: string,
    jobId: string,
): Promise<DecryptedEntry[]> {
    const reader = new ResultsReader(
        new Blob([artifact.encryptedBody]),
        privateKey,
        fingerprint,
        artifact.recipientKeys,
        { jobId },
    )
    try {
        // Captured so approval can re-wrap each key per researcher.
        return await reader.extractFilesWithKeys()
    } catch (err) {
        // Only the legacy cipher leaves bodies unauthenticated. Anywhere else the unwrap has
        // already proven the key, so a decrypt rejection is a tampered body, not a wrong key.
        const authenticated = (reader.manifest.cipher ?? LEGACY_CIPHER) !== LEGACY_CIPHER

        if (err instanceof ResultsIntegrityError || authenticated) {
            throw new ArchiveIntegrityError(ARCHIVE_INTEGRITY_MESSAGE, { cause: err })
        }
        throw err
    }
}

async function decryptFiles(
    encryptedFiles: EncryptedJobFile[],
    privateKey: string,
    jobId: string,
): Promise<JobFileInfo[]> {
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
            const entries = await readArchive(artifact, privateKeyBuffer, fingerprint, jobId)
            for (const entry of entries) {
                files.push({
                    path: entry.path,
                    contents: entry.contents,
                    rawAesKey: entry.rawAesKey,
                    sourceId: artifact.studyJobFileId,
                    // An already-approved input keeps its type.
                    fileType: ENCRYPTED_TO_APPROVED[artifact.fileType] ?? artifact.fileType,
                })
            }
        }
        return files
    } catch (err) {
        if (err instanceof ArchiveIntegrityError) throw err

        throw new DecryptionError('Private key is not valid for these results, check with your administrator', {
            cause: err,
        })
    }
}

export function useDecryptFiles(options: {
    encryptedFiles: EncryptedJobFile[] | undefined
    /** The job these archives were fetched for. Checked against what each archive claims. */
    jobId: string
    onSuccess: (files: JobFileInfo[]) => void
    onError?: (err: Error) => void
}) {
    const { encryptedFiles, jobId, onSuccess, onError } = options

    const form = useForm({
        mode: 'uncontrolled' as const,
        initialValues: { privateKey: '' },
        validate: {
            privateKey: isNotEmpty('Required'),
        },
        validateInputOnChange: true,
    })

    const handleError = (err: Error) => {
        if (err instanceof KeyParseError || err instanceof DecryptionError || err instanceof ArchiveIntegrityError) {
            form.setFieldError('privateKey', err.message)
        }

        // Always reported: a tampered archive is a security signal, not a user mistake.
        if (err instanceof ArchiveIntegrityError) {
            reportMutationError('results failed integrity verification')(err)
        } else if (!onError) {
            reportMutationError('decryption failed')(err)
        }

        onError?.(err)
    }

    const { mutate, isPending } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!encryptedFiles) return []
            return decryptFiles(encryptedFiles, privateKey, jobId)
        },
        onSuccess,
        onError: handleError,
    })

    const decrypt = (privateKey: string) => mutate({ privateKey })

    return { decrypt, isPending, form }
}
