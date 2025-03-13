'use client'

import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Accordion, Checkbox, Flex, Group, Stack, Text, TextInput, Divider, Paper } from '@mantine/core'
import { ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import { css } from '@/styles'
import { JobsTable } from './jobs-table'
import { Study } from '@/schema/study'
import { updateStudyStatusAction } from '@/server/actions/study-actions'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'

export const labelStyle = css({
    width: '10rem',
})

export const inputStyle = css({
    width: '20rem',
})

export const StudyPanel: React.FC<{ encodedStudyId: string; study: Study; studyIdentifier: string }> = ({
    studyIdentifier,
    study,
}) => {
    const router = useRouter()
    const [activeSection, setActiveSection] = useState<string | null>(null)

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
            <Accordion
                chevronPosition="left"
                defaultValue={['study', 'jobs']}
                variant="separated"
                onChange={setActiveSection}
            >
                <Paper>
                    <Accordion.Item value="study">
                        <Accordion.Control>Researcher Study Proposal</Accordion.Control>
                        <Accordion.Panel>
                            <Divider my="sm" mt="sm" mb="md" />
                            <Stack mt={30}>
                                <Flex p={2} gap="md" wrap="wrap">
                                    <Text className={labelStyle}>Study Title</Text>
                                    <TextInput
                                        bg="#ddd"
                                        bd="1px solid #ccc"
                                        disabled
                                        className={inputStyle}
                                        name="title"
                                        data-testid="study-title"
                                        value={study.title}
                                        readOnly
                                    />
                                </Flex>
                                <Flex p={2} gap="md" wrap="wrap">
                                    <Text className={labelStyle}>Study Lead</Text>
                                    <TextInput
                                        bg="#ddd"
                                        bd="1px solid #ccc"
                                        disabled
                                        className={inputStyle}
                                        name="study-lead"
                                        data-testid="study-lead"
                                        value="Researcher Name"
                                        readOnly
                                    />
                                </Flex>

                                <Flex p={2} gap="md">
                                    <Text className={labelStyle}>Principal Investigator</Text>
                                    <TextInput
                                        bg="#ddd"
                                        bd="1px solid #ccc"
                                        className={inputStyle}
                                        name="piName"
                                        value={study.piName}
                                        disabled
                                    />
                                </Flex>

                                <Flex p={2} gap="md" wrap="wrap">
                                    <Text className={labelStyle}>Study Description</Text>
                                    <TextInput
                                        bg="#ddd"
                                        bd="1px solid #ccc"
                                        className={inputStyle}
                                        name="description"
                                        label=""
                                        value={study.description}
                                        disabled={true}
                                    />
                                </Flex>
                                <Group p={2} gap="md">
                                    <Text className={labelStyle}>IRB Document</Text>
                                    <TextInput
                                        bg="#ddd"
                                        bd="1px solid #ccc"
                                        className={inputStyle}
                                        name="irbDocument"
                                        value={study.irbProtocols}
                                        disabled={true}
                                        readOnly
                                    />
                                </Group>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Paper>
                <Accordion.Item value="jobs" mt="xl">
                    <Accordion.Control>Study Code</Accordion.Control>
                    <Accordion.Panel>
                        <Stack></Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </>
    )
}
