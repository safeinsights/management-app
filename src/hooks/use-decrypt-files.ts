import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
import { ResultsReader, ResultsIntegrityError } from 'si-encryption/job-results/reader'
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
            // Captured so approval can re-wrap each key per researcher.
            const entries = await reader.extractFilesWithKeys()
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
        if (err instanceof ResultsIntegrityError) {
            throw new ArchiveIntegrityError(ARCHIVE_INTEGRITY_MESSAGE, { cause: err })
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
            return decryptFiles(encryptedFiles, privateKey)
        },
        onSuccess,
        onError: handleError,
    })

    const decrypt = (privateKey: string) => mutate({ privateKey })

    return { decrypt, isPending, form }
}
