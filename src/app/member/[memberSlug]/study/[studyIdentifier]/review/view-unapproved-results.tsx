import React, { useState } from 'react'
import { useForm } from '@mantine/form'
import { Button, Group, Stack, Textarea } from '@mantine/core'

import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import type { FileEntry } from 'si-encryption/job-results/types'
import { fetchJobResultsEncryptedZipAction } from '@/server/actions/study-job.actions'
import type { StudyJobWithLastStatus } from '@/server/db/queries'
export type { FileEntry }

interface StudyResultsFormValues {
    privateKey: string
}

type Props = {
    job: NonNullable<StudyJobWithLastStatus>
    onApproval: (decryptedResults: FileEntry[]) => void
}

export const ViewUnapprovedResults: React.FC<Props> = ({ job, onApproval }) => {
    const [plainTextResults, setPlainTextResults] = useState<string[]>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
    })

    const { isLoading: isLoadingBlob, data: blob } = useQuery({
        queryKey: ['study-job', job.id],
        queryFn: async () => {
            try {
                return await fetchJobResultsEncryptedZipAction(job.id)
            } catch (error) {
                form.setFieldError('privateKey', 'Failed to fetch results, please try again later.')
                throw error
            }
        },
        enabled: job.latestStatus == 'RUN-COMPLETE',
    })

    const { mutate: decryptResults, isPending: isDecrypting } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!blob) return []

            const privateKeyBuffer = pemToArrayBuffer(privateKey)
            const key = await privateKeyFromBuffer(privateKeyBuffer)

            const fingerprint = await fingerprintPublicKeyFromPrivateKey(key)

            const reader = new ResultsReader(blob, privateKeyBuffer, fingerprint)
            return await reader.extractFiles()
        },
        onSuccess: async (data: FileEntry[]) => {
            onApproval(data)
            setPlainTextResults(data.map((entry) => new TextDecoder().decode(entry.contents)))
        },
        onError: async () => {
            form.setFieldError('privateKey', 'Invalid private key, please double check the key and try again.')
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
            {plainTextResults?.length && plainTextResults.map((text, index) => <Stack key={index}>{text}</Stack>)}
            {job.latestStatus === 'RUN-COMPLETE' && !plainTextResults?.length && (
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
