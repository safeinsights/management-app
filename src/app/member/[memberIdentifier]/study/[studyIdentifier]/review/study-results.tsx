'use client'

import React, { FC } from 'react'
import { useForm } from '@mantine/form'
import { Button, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { StudyJob } from '@/schema/study'
import { notifications } from '@mantine/notifications'
import { fetchJobResultsZipAction } from '@/app/researcher/study/[studyId]/review/actions'
import { useMutation } from '@tanstack/react-query'
import { ResultsReader } from 'si-encryption/job-results/reader'

interface StudyResultsFormValues {
    privateKey: string
}

export const StudyResults: FC<{ latestJob: StudyJob; fingerprint: string | null }> = ({ latestJob, fingerprint }) => {
    const { mutate: decryptResults } = useMutation({
        mutationFn: async ({ jobId, privateKey }: { jobId: string; privateKey: string }) => {
            if (!fingerprint) return

            const blob = await fetchJobResultsZipAction(jobId)
            const reader = new ResultsReader()
            return await reader.decryptZip(blob, privateKey, fingerprint)
        },
        onSuccess: async (data) => {
            console.log('Success!', data)
        },
    })

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
        validate: {
            privateKey: (value: string) => (value.length < 2 ? 'Name must have at least 2 letters' : null),
        },
    })

    if (!latestJob) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
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
        <Paper bg="white" p="xl">
            <Stack>
                <Title order={4}>Study Results</Title>
                <Divider />
                <Stack>
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
                    {/* TODO Hide this eventually behind the form validation */}
                    {/*<Anchor component={Link} target="_blank" href={`/dl/results/${latestJob.id}/`}>*/}
                    {/*    View Results*/}
                    {/*</Anchor>*/}
                </Stack>
            </Stack>
        </Paper>
    )
}
