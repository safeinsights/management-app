import { reportMutationError } from '@/components/errors'
import { ViewFile } from '@/components/job-results'
import { useJobResultsStatus } from '@/components/use-job-results-status'
import { FileType } from '@/database/types'
import { JobFileInfo } from '@/lib/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Group, Stack, Textarea } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useQuery } from '@/components/common'
import { useMutation } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { FC, useState } from 'react'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'

interface StudyResultsFormValues {
    privateKey: string
}

type Props = {
    job: NonNullable<LatestJobForStudy>
    onApproval: (decryptedResults: JobFileInfo[]) => void
}

function approvedTypeForFile(fileType: FileType): FileType {
    if (fileType === 'ENCRYPTED-RESULT') return 'APPROVED-RESULT'
    if (fileType === 'ENCRYPTED-LOG') return 'APPROVED-LOG'
    throw new Error(`Unknown file type ${fileType}`)
}

export const DecryptResults: FC<Props> = ({ job, onApproval }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>([])
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { isApproved, isComplete, isErrored } = useJobResultsStatus(job.statusChanges)

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
        validate: {
            privateKey: isNotEmpty('Required'),
        },
        validateInputOnChange: true,
    })

    const { isLoading: isLoadingBlob, data: encryptedFiles } = useQuery({
        queryKey: ['study-job', job.id],
        queryFn: async () => {
            try {
                return await fetchEncryptedJobFilesAction({ jobId: job.id, orgSlug })
            } catch (error) {
                Sentry.captureException(error)
                form.setFieldError('privateKey', 'Failed to fetch results, please try again later.')
                throw error
            }
        },
        enabled: isComplete || isErrored,
    })

    const { mutate: decryptResults, isPending: isDecrypting } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!encryptedFiles) return []
            let fingerprint = ''
            let privateKeyBuffer: ArrayBuffer = new ArrayBuffer(0)
            try {
                privateKeyBuffer = pemToArrayBuffer(privateKey)
                const key = await privateKeyFromBuffer(privateKeyBuffer)
                fingerprint = await fingerprintPublicKeyFromPrivateKey(key)
            } catch (err) {
                form.setFieldError('privateKey', 'Invalid key data, check that key was copied successfully')
                throw err
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
                form.setFieldError(
                    'privateKey',
                    'Private key is not valid for these results, check with your administrator',
                )
                throw err
            }
        },
        onSuccess: async (files: JobFileInfo[]) => {
            onApproval(files)
            setDecryptedFiles(files)
        },
        onError: reportMutationError('decryption failed'),
    })

    const onSubmit = (values: StudyResultsFormValues) => {
        decryptResults({ privateKey: values.privateKey })
    }

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

    if (isApproved) return null

    return (
        <Stack>
            {decryptedFiles.map((decryptedFile) => (
                <ViewFile file={decryptedFile} key={decryptedFile.path} />
            ))}
            {(isComplete || isErrored) && !decryptedFiles?.length && (
                <form onSubmit={form.onSubmit((values) => onSubmit(values), handleError)}>
                    <Stack>
                        <Textarea
                            label="Enter Reviewer Key"
                            resize="vertical"
                            {...form.getInputProps('privateKey')}
                            placeholder="Enter your Reviewer key to access encrypted content."
                            key={form.key('privateKey')}
                        />
                        <Group>
                            <Button type="submit" disabled={!form.isValid() || isLoadingBlob} loading={isDecrypting}>
                                View Results
                            </Button>
                        </Group>
                    </Stack>
                </form>
            )}
        </Stack>
    )
}
