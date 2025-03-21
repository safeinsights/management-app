'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Accordion, Divider, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import { Study } from '@/schema/study'
import { updateStudyStatusAction } from '@/server/actions/study-actions'

export const StudyPanel: React.FC<{ study: Study }> = ({ study }) => {
    const router = useRouter()

    const backPath = `/researcher/studies/review`

    const { error } = useMutation({
        mutationFn: (status: StudyStatus) => updateStudyStatusAction(study?.id || '', status),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })

    if (error) return <ErrorAlert error={error} />

    return (
        <>
            <Accordion chevronPosition="left" defaultValue="study" variant="separated">
                <Paper>
                    <Accordion.Item value="study">
                        <Accordion.Control>Researcher Study Proposal</Accordion.Control>
                        <Accordion.Panel>
                            <Divider my="sm" mt="sm" mb="md" />
                            <Stack mt={30}>
                                <Group>
                                    <Text> Study Title</Text>
                                    <TextInput
                                        disabled
                                        name="title"
                                        data-testid="study-title"
                                        value={study.title}
                                        readOnly
                                    />
                                </Group>
                                <Group>
                                    <Text>Study Lead</Text>
                                    <TextInput
                                        disabled
                                        name="study-lead"
                                        data-testid="study-lead"
                                        value="Researcher Name"
                                        readOnly
                                    />
                                </Group>

                                <Group>
                                    <Text>Principal Investigator</Text>
                                    <TextInput name="piName" value={study.piName} disabled />
                                </Group>

                                <Group>
                                    <Text>IRB Document</Text>
                                    <TextInput name="irbDocument" value="IRB Document.pdf" disabled={true} readOnly />
                                </Group>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Paper>
                <Accordion.Item value="jobs" mt="xl">
                    <Accordion.Control>Study Code</Accordion.Control>
                    <Accordion.Panel>
                        <Divider my="sm" mt="sm" mb="md" />
                        <Stack></Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </>
    )
}
