'use client'

import React from 'react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Accordion, Container, Stack, Text, Flex, TextInput, Textarea, Checkbox } from '@mantine/core'
import { labelStyle, inputStyle } from './style.css'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { updateStudyStatusAction } from './actions'
import type { StudyStatus } from '@/database/types'
import { RunsTable } from '@/app/researcher/studies/runs-table'




type Study = {
    id: string
    title: string
    piName: string
    description: string
    irbDocument: string
    highlights: boolean
    eventCapture:boolean
    containerLocation: string 

}


export const ReviewControls: React.FC<{ study?: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
    const router = useRouter()
    const [activeId, setActiveId] = useState<string | null>(null)

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

    const proposalReviewAccordion = [
        {
            value: "Research Study Proposal",
            title: study?.title,
            piName: study?.piName,
            description: study?.description,
            irbDocument: 'IRB Document.pdf',
            highlights: study?.highlights,
            eventCapture: study?.eventCapture
        }]

    const codeReviewAccordion= [
        {
            value: "Researcher Code",
            container: 'Placeholder',
            codeNumber: 0,
            date: "11/5/2024",
            status: "status",
        },

    ]

    const proposalItems = proposalReviewAccordion.map((item) => (
        <Accordion.Item key={item.value} value={item.value}>
        <Accordion.Control bg="#ccc">{item.value}</Accordion.Control>
        <Accordion.Panel>
            <Stack>
                <Flex p={2} gap="md" wrap="wrap">
                        <Text className={labelStyle}>Study Title</Text>
                        <TextInput
                            bg="#ddd"
                            bd="1px solid #ccc"
                            disabled
                            className={inputStyle}
                            name="title"
                            data-testid="study-title"
                            value={proposalReviewAccordion[0].title}
                            readOnly
                        />
                    </Flex>
                    <Flex p={2} gap="md" wrap="wrap">
                        <Text className={labelStyle}>Study Description</Text>
                        <Textarea bg="#ddd" bd="1px solid #ccc"className={inputStyle} name="description" label="" value={proposalReviewAccordion[0].description} disabled={true} />
                    </Flex>

                    <Flex p={2} gap="md">
                        <Text className={labelStyle}>Principal Investigator</Text>
                        <TextInput bg="#ddd" bd="1px solid #ccc" className={inputStyle} name="piName" value={proposalReviewAccordion[0].piName} disabled/>
                    </Flex>
                    <Group p={2} gap="md">
                    <Text className={labelStyle}>IRB Approval Documentation</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        className={inputStyle}
                        name="irbDocument"
                        value={proposalReviewAccordion[0].irbDocument}
                        disabled={true}
                        readOnly
                    />
                    <Text fs="italic" c="dimmed" w="30%">
                        {'For the pilot, we are skipping the IRB step'}
                    </Text>
                </Group>
            </Stack>

            <Stack align="stretch">
                <Flex p={2} gap="lg">
                    <Text className={labelStyle}>Datasets of Interest</Text>
                    <Stack>
                        <Checkbox
                            name="highlights"
                            label="Highhlights and Notes"
                            value={proposalReviewAccordion[0].highlights} 
                            disabled={true}
                        ></Checkbox>
                        <Checkbox
                            name="eventCapture"
                            label="Event Capture"
                            value={proposalReviewAccordion[0].eventCapture} 
                            disabled={true}
                        ></Checkbox>
                    </Stack>
                </Flex>
            </Stack>
        </Accordion.Panel>
        </Accordion.Item>
    ))

    const codeReviewItems = codeReviewAccordion.map((item) => (
        <Accordion.Item key={item.value} value={item.value}>
        <Accordion.Control bg="#ccc">{item.value}</Accordion.Control>
        <Accordion.Panel>
            <Stack>
                {study && (
                    <RunsTable isActive={activeId == study.id} study={study} />
                )}
            </Stack>
            <Group>
                <Text>{codeReviewAccordion[0].codeNumber + 1 }{')'} </Text>
                <Text>Code Run Submitted on: {codeReviewAccordion[0].date} | </Text>
                <Text>Status: {codeReviewAccordion[0].status} </Text>
                <Button color="blue">
                    View Code
                </Button>
            </Group>
        </Accordion.Panel>
        </Accordion.Item>
    ))



    if (!study) return <AlertNotFound title="no study found" message="the study was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <>
        <Container>
            <Accordion defaultValue="Research Study Proposal">
                <Accordion.Item>
                    {proposalItems}
                </Accordion.Item>
                <Accordion.Item>
                    {codeReviewItems}
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
        </Container>
        </>   

    )
}
