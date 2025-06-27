import React, { FC, useState } from 'react'
import { useForm } from '@mantine/form'
import { Button, Group, Modal, Stack, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import * as Sentry from '@sentry/nextjs'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { useParams } from 'next/navigation'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { RenderCSV } from '@/components/render-csv'
import { FileEntryWithJobFileInfo } from '@/lib/types'
import { DownloadResultsLink, ViewResultsLink } from '@/components/links'
import { useDisclosure } from '@mantine/hooks'

interface StudyResultsFormValues {
    privateKey: string
}

type Props = {
    job: NonNullable<StudyJobWithLastStatus>
    onApproval: (decryptedResults: FileEntryWithJobFileInfo[]) => void
}

export const DecryptResults: FC<Props> = ({ job, onApproval }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<FileEntryWithJobFileInfo[]>([])
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
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
        enabled: !!job.statusChanges.find((sc) => sc.status == 'RUN-COMPLETE'),
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
                const decryptedFiles: FileEntryWithJobFileInfo[] = []
                for (const encryptedBlob of encryptedFiles) {
                    const reader = new ResultsReader(encryptedBlob.blob, privateKeyBuffer, fingerprint)
                    const extractedFiles = await reader.extractFiles()
                    for (const extractedFile of extractedFiles) {
                        decryptedFiles.push({
                            ...extractedFile,
                            sourceId: encryptedBlob.sourceId,
                            fileType: encryptedBlob.fileType,
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
        onSuccess: async (files: FileEntryWithJobFileInfo[]) => {
            onApproval(files)
            setDecryptedFiles(files)
        },
        onError: async (err) => {
            Sentry.captureException(err)
        },
    })

    const onSubmit = (values: StudyResultsFormValues) => {
        decryptResults({ privateKey: values.privateKey })
    }

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

    return (
        <Stack>
            {decryptedFiles.map((decryptedFile) => (
                <FileResult fileResult={decryptedFile} key={decryptedFile.path} />
            ))}
            {job.statusChanges.find((sc) => sc.status === 'RUN-COMPLETE') && !decryptedFiles?.length && (
                <form onSubmit={form.onSubmit((values) => onSubmit(values), handleError)}>
                    <Group>
                        <Textarea
                            resize="vertical"
                            {...form.getInputProps('privateKey')}
                            label="To unlock and review the results of this analysis, please enter the private key you’ve originally created when first onboarding into SafeInsights"
                            placeholder="Enter private key"
                            key={form.key('privateKey')}
                        />
                        <Button type="submit" disabled={!form.isValid || isLoadingBlob} loading={isDecrypting}>
                            View Results
                        </Button>
                    </Group>
                </form>
            )}
        </Stack>
    )
}

const FileResult: FC<{ fileResult: FileEntryWithJobFileInfo }> = ({ fileResult }) => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Group>
            <Title order={4}>{fileResult.path}</Title>
            <DownloadResultsLink target="_blank" filename={fileResult.path} content={fileResult.contents} />
            <ViewResultsLink content={fileResult.contents} />
            <Modal size="80%" opened={opened} onClose={close} title={fileResult.path}>
                <RenderCSV csv={new TextDecoder().decode(fileResult.contents)} />
            </Modal>
            <Button onClick={open}>View Results</Button>
        </Group>
    )
}
