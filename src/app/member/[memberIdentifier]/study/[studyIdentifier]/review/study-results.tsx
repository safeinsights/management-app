'use client'

import React, { FC, useState } from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { StudyJob } from '@/schema/study'
import { notifications } from '@mantine/notifications'
import { fetchJobResultsZipAction } from '@/app/researcher/study/[studyId]/review/actions'
import { useMutation } from '@tanstack/react-query'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { JobReviewButtons } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/job-review-buttons'
import Link from 'next/link'

interface StudyResultsFormValues {
    privateKey: string
}

export const StudyResults: FC<{ latestJob: StudyJob; fingerprint: string | null }> = ({ latestJob, fingerprint }) => {
    const [decryptedResults, setDecryptedResults] = useState<string[]>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
    })

    const { mutate: decryptResults } = useMutation({
        mutationFn: async ({ jobId, privateKey }: { jobId: string; privateKey: string }) => {
            if (!fingerprint) return []

            const blob = await fetchJobResultsZipAction(jobId)
            const reader = new ResultsReader()
            return await reader.decryptZip(blob, privateKey, fingerprint)
        },
        onSuccess: async (data: string[]) => {
            setDecryptedResults(data)
        },
        onError: async () => {
            form.setFieldError('privateKey', 'Invalid private key')
        },
    })

    const onSubmit = (values: StudyResultsFormValues) => {
        decryptResults({ jobId: latestJob.id, privateKey: values.privateKey })
    }

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

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
                <Text>
                    It looks like you have not generated a key yet. You cannot view results without a private key.
                </Text>
            </Paper>
        )
    }

    return (
        <Paper bg="white" p="xl">
            <Stack>
                <Group justify="space-between">
                    <Title order={4}>Study Results</Title>
                    {decryptedResults?.length && (
                        <JobReviewButtons job={latestJob} decryptedResults={decryptedResults} />
                    )}
                </Group>
                <Divider />
                <Stack>
                    {!decryptedResults?.length ? (
                        <form onSubmit={form.onSubmit((values) => onSubmit(values), handleError)}>
                            <Group>
                                <TextInput
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
                    ) : (
                        <Text>{decryptedResults}</Text>
                    )}
                </Stack>
                <Stack>
                    {/* TODO Lock this down behind approvedAt field when it exists */}
                    <Anchor target="_blank" component={Link} href={`/dl/results/${latestJob.id}`}>
                        View results here
                    </Anchor>
                </Stack>
            </Stack>
        </Paper>
    )
}
