'use client'

import React, { FC } from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { StudyJob } from '@/schema/study'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'

export const StudyResults: FC<{ latestJob: StudyJob }> = ({ latestJob }) => {
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
                    {/* TODO Hide this eventually behind the form validation */}
                    <Anchor component={Link} target="_blank" href={`/dl/results/${latestJob.id}/`}>
                        View Results
                    </Anchor>
                </Stack>
            </Stack>
        </Paper>
    )
}
