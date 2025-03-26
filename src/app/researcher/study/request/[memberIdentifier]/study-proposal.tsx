'use client'

import React, { FC } from 'react'
import { Anchor, Divider, FileInput, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'


const Icons: [RegExp, React.ReactNode][] = [
    [/\.docx?$/i, <FileDoc key="doc" size={14} color="#291bc4" />],
    [/\.txt$/i, <FileText key="txt" size={14} color="#291bc4" />],
    [/\.pdf$/i, <FilePdf key="pdf" size={14} color="#291bc4" />],
]

const getFileUploadIcon = (fileName?: string | null) => {
    if (!fileName) return <UploadSimple size={14} color="#291bc4" weight="fill" />

    const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
    return matchedIcon || <UploadSimple size={14} color="#291bc4" weight="fill" />
}

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}> = ({ studyProposalForm }) => {
    const fileUpload = getFileUploadIcon(studyProposalForm.values.descriptionDocument?.name)
    const irbFileUpload = getFileUploadIcon(studyProposalForm.values.irbDocument?.name)
    const agreementFileUpload = getFileUploadIcon(studyProposalForm.values.agreementDocument?.name)

    return (
        <Paper p="md">
            <Title order={4}>Study Proposal</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text>
                This section is key to your proposal, as it defines the analysis that will generate the results you’re
                intending to obtain from the Member’s data. Upload any necessary files to support your analysis. In this
                iteration, we currently support .r and .rmd files.
            </Text>
            <Stack gap="lg" mt="md">
                {/* TODO flesh out with UX/do when hifi-s ready */}
                <Group gap="xl">
                    <Text>Study Title</Text>
                    <TextInput
                        aria-label="Study Title"
                        placeholder="Enter a title (max. 50 characters)"
                        {...studyProposalForm.getInputProps('title')}
                    />
                </Group>

                <Group gap="xl">
                    <Text>Study Lead</Text>
                    <TextInput aria-label="Study Lead" disabled value="Researcher Name" />
                </Group>

                <Group gap="xl">
                    <Text>Principal Investigator</Text>
                    <TextInput aria-label="Principal Investigator" {...studyProposalForm.getInputProps('piName')} />
                </Group>

                <Group>
                    <Text>Study Description</Text>
                    {fileUpload}
                    <Stack gap={0}>
                        <FileInput
                            name="descriptionDocument"
                            component={Anchor}
                            aria-label="Upload Study Description Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.txt,.pdf"
                            {...studyProposalForm.getInputProps('descriptionDocument')}
                        />
                        <Text size="xs" c="dimmed">
                            Accepted formats: doc, docx, pdf and txt
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xs">
                    <Text>IRB Document</Text>
                    {irbFileUpload}
                    <Stack gap={0}>
                        <FileInput
                            name="irbDocument"
                            component={Anchor}
                            aria-label="Upload IRB Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.txt,.pdf"
                            key={studyProposalForm.key('irbDocument')}
                            {...studyProposalForm.getInputProps('irbDocument')}
                        />
                        <Text size="xs" c="dimmed">
                            Accepted formats: doc, docx, pdf and txt
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xs">
                    <Text>Agreement Document</Text>
                    {agreementFileUpload}
                    <Stack gap={0}>
                        <FileInput
                            name="agreementDocument"
                            aria-label="Upload Agreement Document"
                            component={Anchor}
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.txt,.pdf"
                            key={studyProposalForm.key('agreementDocument')}
                            {...studyProposalForm.getInputProps('agreementDocument')}
                        />
                        <Text size="xs" c="dimmed">
                            Accepted formats: doc, docx, pdf and txt
                        </Text>
                    </Stack>
                </Group>
            </Stack>
        </Paper>
    )
}
