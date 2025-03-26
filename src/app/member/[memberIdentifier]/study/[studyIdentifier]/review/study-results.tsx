'use client'

import React, { FC, useState } from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { StudyJob } from '@/schema/study'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { JobReviewButtons } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/job-review-buttons'
import Link from 'next/link'
import { pemToArrayBuffer } from 'si-encryption/util'
import { StudyJobStatus } from '@/database/types'
import { fetchJobResultsZipAction } from '@/server/actions/study-job.actions'

interface StudyResultsFormValues {
    privateKey: string
}

export const StudyResults: FC<{
    latestJob: StudyJob | null
    fingerprint: string | undefined
    jobStatus: StudyJobStatus | null
}> = ({ latestJob, fingerprint, jobStatus }) => {
    const [decryptedResults, setDecryptedResults] = useState<string[]>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
    })

    const { mutate: decryptResults } = useMutation({
        mutationFn: async ({ jobId, privateKey }: { jobId: string; privateKey: string }) => {
            if (!fingerprint) return []

            const blob = await fetchJobResultsZipAction(jobId)
            const privateKeyBuffer = pemToArrayBuffer(privateKey)
            const reader = new ResultsReader(blob, privateKeyBuffer, fingerprint)
            return await reader.decryptZip()
        },
        onSuccess: async (data: string[]) => {
            setDecryptedResults(data)
        },
        onError: async (error) => {
            console.error(error)
            form.setFieldError('privateKey', 'Invalid private key')
        },
    })

    if (!latestJob) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
            </Paper>
        )
    }

    if (!fingerprint) {
        return (
            <Paper bg="white" p="xl">
                <Text>It looks like you have not generated a key yet.</Text>
                <Text>You cannot view results without a private key.</Text>
            </Paper>
        )
    }

    if (jobStatus === 'RESULTS-REJECTED') {
        return (
            <Paper bg="white" p="xl">
                <Title order={4}>Latest results rejected</Title>
            </Paper>
        )
    }

    const onSubmit = (values: StudyResultsFormValues) => {
        decryptResults({ jobId: latestJob.id, privateKey: values.privateKey })
    }

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

    return (
        <Paper bg="white">
            <Stack>
                <Group justify="space-between">
                    {decryptedResults?.length && (
                        <JobReviewButtons job={latestJob} decryptedResults={decryptedResults} />
                    )}
                </Group>
                <Stack>{decryptedResults}</Stack>
                <Stack>
                    {jobStatus === 'RUN-COMPLETE' && !decryptedResults?.length && (
                        <form onSubmit={form.onSubmit((values) => onSubmit(values), handleError)}>
                            <Group>
                                <Textarea
                                    resize="vertical"
                                    {...form.getInputProps('privateKey')}
                                    label="To unlock and review the results of this analysis, please enter the private key you’ve originally created when first onboarding into SafeInsights"
                                    placeholder="Enter private key"
                                    key={form.key('privateKey')}
                                />
                                <Button type="submit" disabled={!form.isValid}>
                                    Validate
                                </Button>
                            </Group>
                        </form>
                    )}
                </Stack>
                {jobStatus === 'RESULTS-APPROVED' ? (
                    <Stack>
                        <Anchor target="_blank" component={Link} href={`/dl/results/${latestJob.id}`}>
                            View results here
                        </Anchor>
                    </Stack>
                ) : null}
            </Stack>
        </Paper>
    )
}
