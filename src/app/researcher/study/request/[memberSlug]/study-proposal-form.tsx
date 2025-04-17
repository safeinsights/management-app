'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Group, Stack, Paper, Text, TextInput, Title, useMantineTheme } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-schema'

const FormLabel = ({ label }: { label: string }) => {
    return (
        <Text fw="bold" miw={200}>
            {label}
        </Text>
    )
}

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}> = ({ studyProposalForm }) => {
    const theme = useMantineTheme()
    const color = theme.colors.purple[6]

    const getFileUploadIcon = (color: string, fileName?: string | null) => {
        if (!fileName) return <UploadSimple size={14} color={color} weight="fill" />
        const Icons: [RegExp, React.ReactNode][] = [
            [/\.docx?$/i, <FileDoc key="doc" size={14} color={color} />],
            [/\.txt$/i, <FileText key="txt" size={14} color={color} />],
            [/\.pdf$/i, <FilePdf key="pdf" size={14} color={color} />],
        ]
        const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
        return matchedIcon || <UploadSimple size={14} color={color} weight="fill" />
    }

    const fileUpload = getFileUploadIcon(color, studyProposalForm.values.descriptionDocument?.name ?? '')
    const irbFileUpload = getFileUploadIcon(color, studyProposalForm.values.irbDocument?.name ?? '')
    const agreementFileUpload = getFileUploadIcon(color, studyProposalForm.values.agreementDocument?.name ?? '')

    const { user } = useUser()

    return (
        <Paper p="md">
            <Title order={4}>Study Proposal</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">
                This section is here to help you submit your study proposal. Consider providing as much detail as
                possible to ensure the Reviewer has all the information needed to make an informed decision.
            </Text>
            <Stack gap="xl">
                <Group align="start">
                    <FormLabel label="Study Title" />
                    <TextInput
                        aria-label="Study Title"
                        placeholder="Enter a title (max. 50 characters)"
                        {...studyProposalForm.getInputProps('title')}
                        inputSize="50"
                        maxLength={50}
                    />
                </Group>
                <Group align="start">
                    <FormLabel label="Study Lead" />
                    <TextInput aria-label="Study Lead" disabled value={user?.fullName ?? ''} inputSize="50" />
                </Group>
                <Group align="start">
                    <FormLabel label="Principal Investigator" />
                    <TextInput
                        aria-label="Principal Investigator"
                        placeholder="Full Name"
                        {...studyProposalForm.getInputProps('piName')}
                        inputSize="50"
                        maxLength={50}
                    />
                </Group>
                <Group align="start">
                    <FormLabel label="Study Description" />
                    <Group gap="md">
                        {fileUpload}
                        <FileInput
                            name="descriptionDocument"
                            aria-label="Upload Study Description Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                            {...studyProposalForm.getInputProps('descriptionDocument')}
                        />
                    </Group>
                </Group>
                <Group align="start">
                    <FormLabel label="IRB Document" />
                    <Group gap="md">
                        {irbFileUpload}
                        <FileInput
                            {...studyProposalForm.getInputProps('irbDocument')}
                            name="irbDocument"
                            aria-label="Upload IRB Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                        />
                    </Group>
                </Group>
                <Group align="start">
                    <FormLabel label="Agreement Document" />
                    <Group gap="md">
                        {agreementFileUpload}
                        <FileInput
                            name="agreementDocument"
                            aria-label="Upload Agreement Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                            {...studyProposalForm.getInputProps('agreementDocument')}
                        />
                    </Group>
                </Group>
            </Stack>
        </Paper>
    )
}
