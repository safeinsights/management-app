import { reportMutationError } from '@/components/errors'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty, useForm } from '@mantine/form'
import { useMutation } from '@/common'
import { decryptFile } from 'si-encryption/job-results/crypto'
import { pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileType } from '@/database/types'

// One decomposed encrypted file as returned by fetchEncryptedJobFilesAction: the
// ciphertext body plus its iv and the requesting user's wrapped AES key (`crypt`).
export type EncryptedJobFile = {
    studyJobFileId: string
    fileType: FileType
    path: string
    name: string
    iv: string
    crypt: string
    encryptedBody: ArrayBuffer
}

class KeyParseError extends Error {}
class DecryptionError extends Error {}

async function decryptFiles(encryptedFiles: EncryptedJobFile[], privateKey: string): Promise<JobFileInfo[]> {
    let privateKeyBuffer: ArrayBuffer
    try {
        privateKeyBuffer = pemToArrayBuffer(privateKey)
        await privateKeyFromBuffer(privateKeyBuffer)
    } catch (err) {
        throw new KeyParseError('Invalid key data, check that key was copied successfully', { cause: err })
    }
    try {
        return await Promise.all(
            encryptedFiles.map(async (file) => {
                const { contents, rawAesKey } = await decryptFile({
                    body: file.encryptedBody,
                    iv: file.iv,
                    crypt: file.crypt,
                    privateKey: privateKeyBuffer,
                })
                return {
                    path: file.name,
                    contents,
                    rawAesKey,
                    sourceId: file.studyJobFileId,
                    // Map an encrypted type to its approved form; an already-approved input
                    // (researcher viewing shared results) keeps its type.
                    fileType: ENCRYPTED_TO_APPROVED[file.fileType] ?? file.fileType,
                }
            }),
        )
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
