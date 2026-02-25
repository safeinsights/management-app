import { reportMutationError } from '@/components/errors'
import { approvedTypeForFile } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { isNotEmpty, useForm } from '@mantine/form'
import { useMutation } from '@/common'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileType } from '@/database/types'

export type EncryptedJobFile = {
    blob: Blob
    sourceId: string
    fileType: FileType
}

class KeyParseError extends Error {}
class DecryptionError extends Error {}

async function decryptFiles(encryptedFiles: EncryptedJobFile[], privateKey: string): Promise<JobFileInfo[]> {
    let fingerprint = ''
    let privateKeyBuffer: ArrayBuffer = new ArrayBuffer(0)
    try {
        privateKeyBuffer = pemToArrayBuffer(privateKey)
        const key = await privateKeyFromBuffer(privateKeyBuffer)
        fingerprint = await fingerprintPublicKeyFromPrivateKey(key)
    } catch (err) {
        throw new KeyParseError('Invalid key data, check that key was copied successfully', { cause: err })
    }
    try {
        const decryptedFiles: JobFileInfo[] = []
        for (const encryptedBlob of encryptedFiles) {
            const reader = new ResultsReader(encryptedBlob.blob, privateKeyBuffer, fingerprint)
            const extractedFiles = await reader.extractFiles()
            for (const extractedFile of extractedFiles) {
                decryptedFiles.push({
                    ...extractedFile,
                    sourceId: encryptedBlob.sourceId,
                    fileType: approvedTypeForFile(encryptedBlob.fileType),
                })
            }
        }
        return decryptedFiles
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
