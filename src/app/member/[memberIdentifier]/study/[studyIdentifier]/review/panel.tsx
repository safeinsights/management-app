'use client'

import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Accordion, Button, Checkbox, Flex, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { updateStudyStatusAction } from './actions'
import type { StudyStatus } from '@/database/types'
import { JobsTable } from './jobs-table'
import { css } from '@/styles'
import { Study } from '@/schema/study'

export const labelStyle = css({
    width: '10rem',
})

export const inputStyle = css({
    width: '20rem',
})

export const StudyPanel: React.FC<{ study: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
    const router = useRouter()
    const [activeSection, setActiveSection] = useState<string | null>(null)

    const backPath = `/member/${memberIdentifier}/studies/review`

    const {
        mutate: updateStudy,
        isPending,
        error,
    } = useMutation({
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
            <Accordion onChange={setActiveSection}>
                <Accordion.Item value="study">
                    <Accordion.Control bg="#ccc">Researcher Study Proposal</Accordion.Control>
                    <Accordion.Panel>
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
                                <Text className={labelStyle}>Study Description</Text>
                                <Textarea
                                    bg="#ddd"
                                    bd="1px solid #ccc"
                                    className={inputStyle}
                                    name="description"
                                    label=""
                                    value={study.description}
                                    disabled={true}
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
                            <Group p={2} gap="md">
                                <Text className={labelStyle}>IRB Approval Documentation</Text>
                                <TextInput
                                    bg="#ddd"
                                    bd="1px solid #ccc"
                                    className={inputStyle}
                                    name="irbDocument"
                                    value={'IRB Document.pdf'}
                                    disabled={true}
                                    readOnly
                                />
                                <Text fs="italic" c="dimmed" w="30%">
                                    {'For the pilot, we are skipping the IRB step'}
                                </Text>
                            </Group>
                        </Stack>

                        <Stack align="stretch" mb={30}>
                            <Flex p={2} gap="lg">
                                <Text className={labelStyle}>Datasets of Interest</Text>
                                <Stack>
                                    <Checkbox
                                        name="highlights"
                                        label="Highhlights and Notes"
                                        checked={study.dataSources?.includes('highlights')}
                                        disabled={true}
                                    ></Checkbox>
                                    <Checkbox
                                        name="eventCapture"
                                        label="Event Capture"
                                        checked={study.dataSources?.includes('eventCapture')}
                                        disabled={true}
                                    ></Checkbox>
                                </Stack>
                            </Flex>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="jobs">
                    <Accordion.Control bg="#ccc">Researcher Code</Accordion.Control>
                    <Accordion.Panel>
                        <Stack>
                            <JobsTable
                                isActive={activeSection == 'jobs'}
                                study={study}
                                memberIdentifier={memberIdentifier}
                            />
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
            <Group gap="xl" p={2} mt={30} justify="flex-end">
                {/* <Button color="red" onClick={() => updateStudy('REJECTED')} loading={isPending}>
                    Reject
                </Button> */}
                <Button color="blue" onClick={() => updateStudy('APPROVED')} loading={isPending}>
                    Approve Code & Study Proposal
                </Button>
            </Group>
        </>
    )
}
