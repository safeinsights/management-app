'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Group, Paper, Stack, Text, TextInput, Title, useMantineTheme } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

const FormLabel = ({ label }: { label: string }) => {
    return (
        <Title order={5} w={'10%'} fw="semibold">
            {label}
        </Title>
    )
}

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}> = ({ studyProposalForm }) => {
    const theme = useMantineTheme()
    const color = theme.colors.blue[7]

    const getFileUploadIcon = (color: string, fileName?: string | null) => {
        if (!fileName) return <UploadSimple size={14} color={theme.colors.purple[5]} weight="fill" />
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
        <Paper p="xl">
            <Title order={4}>Study Proposal</Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>
                    This section is here to help you submit your study proposal. Consider providing as much detail as
                    possible to ensure the Reviewer has all the information needed to make an informed decision.
                </Text>
                <Group align="flex-start">
                    <FormLabel label="Study Title" />
                    <TextInput
                        w={'30%'}
                        aria-label="Study Title"
                        placeholder="Enter a title (max. 50 characters)"
                        {...studyProposalForm.getInputProps('title')}
                        maxLength={50}
                    />
                </Group>

                <Group align="flex-start">
                    <FormLabel label="Study Lead" />
                    <TextInput w={'30%'} aria-label="Study Lead" disabled value={user?.fullName ?? ''} />
                </Group>

                <Group align="flex-start">
                    <FormLabel label="Principal Investigator" />
                    <TextInput
                        w={'30%'}
                        aria-label="Principal Investigator"
                        placeholder="Full Name (max. 100 characters)"
                        {...studyProposalForm.getInputProps('piName')}
                        maxLength={100}
                    />
                </Group>

                <Group align="flex-start">
                    <FormLabel label="Study Description" />
                    <FileInput
                        w={'30%'}
                        name="descriptionDocument"
                        leftSection={fileUpload}
                        aria-label="Upload Study Description Document"
                        placeholder="Upload Study Description Document"
                        clearable
                        accept=".doc,.docx,.pdf"
                        {...studyProposalForm.getInputProps('descriptionDocument')}
                    />
                </Group>

                <Group align="flex-start">
                    <FormLabel label="IRB Document" />
                    <FileInput
                        w={'30%'}
                        leftSection={irbFileUpload}
                        {...studyProposalForm.getInputProps('irbDocument')}
                        name="irbDocument"
                        aria-label="Upload IRB Document"
                        placeholder="Upload IRB Document"
                        clearable
                        accept=".doc,.docx,.pdf"
                    />
                </Group>

                <Group align="flex-start">
                    <FormLabel label="Agreement Document" />
                    <FileInput
                        w={'30%'}
                        leftSection={agreementFileUpload}
                        name="agreementDocument"
                        aria-label="Upload Agreement Document"
                        placeholder="Upload Agreement Document"
                        clearable
                        accept=".doc,.docx,.pdf"
                        {...studyProposalForm.getInputProps('agreementDocument')}
                    />
                </Group>
            </Stack>
        </Paper>
    )
}
