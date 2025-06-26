import React, { FC, useState } from 'react'
import { useForm } from '@mantine/form'
import { Button, Group, Stack, Textarea, Title } from '@mantine/core'

import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import * as Sentry from '@sentry/nextjs'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileEntry } from 'si-encryption/job-results/types'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { useParams } from 'next/navigation'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
import { RenderCSV } from '@/components/render-csv'

interface StudyResultsFormValues {
    privateKey: string
}

type Props = {
    job: NonNullable<StudyJobWithLastStatus>
    onApproval: (decryptedResults: FileEntry[]) => void
}

export const DecryptResults: FC<Props> = ({ job, onApproval }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<FileEntry[]>([])
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
    })

    const { isLoading: isLoadingBlob, data: encryptedBlobs } = useQuery({
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
            if (!encryptedBlobs) return []
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
                const decryptedFiles: FileEntry[] = []
                for (const encryptedBlob of encryptedBlobs) {
                    const reader = new ResultsReader(encryptedBlob, privateKeyBuffer, fingerprint)
                    const decryptedFileEntry = await reader.extractFiles()
                    decryptedFiles.push(...decryptedFileEntry)
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
        onSuccess: async (files: FileEntry[]) => {
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
            <FileResults fileResults={decryptedFiles} />
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

const FileResults: FC<{ fileResults: FileEntry[] }> = ({ fileResults }) => {
    return fileResults.map((fileResult) => (
        <Stack key={fileResult.path}>
            <Title order={4}>{fileResult.path}</Title>
            {/* TODO Remake the renderCSV to be in a modal? and either
                 A) make it generic
                 or
                 B) Conditionally render results in CSV and logs in text?

             */}
            <RenderCSV csv={new TextDecoder().decode(fileResult.contents)} />
        </Stack>
    ))
}
