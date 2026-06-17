import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty, useForm } from '@mantine/form'
import { useMutation } from '@/common'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileType } from '@/database/types'

// One encrypted artifact from fetchEncryptedJobFilesAction: the whole-zip ciphertext blob (prod
// format, embedded manifest). Decrypting it yields the inner plaintext files.
//
// `overrideKeys` (inner file path -> wrapped AES key) is set only for lab researchers, who are
// NOT manifest recipients: their per-file re-wrapped keys come from study_job_file_key. Empty for
// enclave reviewers, who decrypt via the embedded manifest using their own key's fingerprint.
export type EncryptedJobFile = {
    studyJobFileId: string
    fileType: FileType
    name: string
    encryptedBody: ArrayBuffer
    overrideKeys: Record<string, string>
}

class KeyParseError extends Error {}
class DecryptionError extends Error {}

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
                artifact.overrideKeys,
            )
            // Per-file raw AES key: each inner file has its own key, so re-wrap at approval wraps
            // each file's key for the researchers (see buildSharedFiles).
            const entries = await reader.extractFilesWithKeys()
            for (const entry of entries) {
                files.push({
                    path: entry.path,
                    contents: entry.contents,
                    rawAesKey: entry.rawAesKey,
                    sourceId: artifact.studyJobFileId,
                    // Map an encrypted type to its approved form; an already-approved input
                    // (researcher viewing shared results) keeps its own type.
                    fileType: ENCRYPTED_TO_APPROVED[artifact.fileType] ?? artifact.fileType,
                })
            }
        }
        return files
    } catch (err) {
        throw new DecryptionError('Private key is not valid for these results, check with your administrator', {
            cause: err,
        })
    }
}

export function useDecryptFiles(options: {
    encryptedFiles: EncryptedJobFile[] | undefined
    onSuccess: (files: JobFileInfo[]) => void
}) {
    const { encryptedFiles, onSuccess } = options

    const form = useForm({
        mode: 'uncontrolled' as const,
        initialValues: { privateKey: '' },
        validate: {
            privateKey: isNotEmpty('Required'),
        },
        validateInputOnChange: true,
    })

    const handleError = (err: Error) => {
        if (err instanceof KeyParseError || err instanceof DecryptionError) {
            form.setFieldError('privateKey', err.message)
        }
        reportMutationError('decryption failed')(err)
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
