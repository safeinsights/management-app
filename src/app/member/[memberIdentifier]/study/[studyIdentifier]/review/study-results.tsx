'use client'

import React, { FC } from 'react'
import { useForm } from '@mantine/form'
import { Button, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { StudyJob } from '@/schema/study'
import { fetchJobResultsAction } from '@/app/researcher/study/[encodedStudyId]/review/actions'
import { notifications } from '@mantine/notifications'

export const StudyResults: FC<{ latestJob: StudyJob }> = ({ latestJob }) => {
    const { data: results, isLoading } = useQuery({
        queryKey: ['resultsForStudyJob', latestJob.id],
        queryFn: () => {
            return fetchJobResultsAction(latestJob.id)
        },
    })

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
        validate: {
            privateKey: (value: string) => (value.length < 2 ? 'Name must have at least 2 letters' : null),
        },
    })

    if (isLoading) return null

    const handleError = (errors: typeof form.errors) => {
        if (errors.name) {
            notifications.show({ message: 'Please fill name field', color: 'red' })
        } else if (errors.email) {
            notifications.show({ message: 'Please provide a valid email', color: 'red' })
        }
    }

    return (
        <Paper bg="white" p="xl">
            <Stack>
                <Title order={4}>Study Results</Title>
                <Divider />
                {/* TODO Just temporary until we figure out what to do with results */}
                <Text>{results?.length}</Text>
                <Stack>
                    <form onSubmit={form.onSubmit(() => {}, handleError)}>
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
                </Stack>
            </Stack>
        </Paper>
    )
}
