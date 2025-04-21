'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Group, Paper, Stack, Text, TextInput, Title, useMantineTheme } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

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
        <Paper pt="sm" pl="xl" pr="lg" pb="lg">
            <Title order={4} pr="lg" pb="sm">
                Study Proposal
            </Title>
            <Divider my="md" />
            <Text mb="md">
                This section is here to help you submit your study proposal. Consider providing as much detail as
                possible to ensure the Reviewer has all the information needed to make an informed decision.
            </Text>

                <Stack gap="xl">
                    <Group align="flex-start">
                        <Text w={'20%'} fw="bold">
                            Study Title
                        </Text>
                        <TextInput
                            w={'30%'}
                            aria-label="Study Title"
                            placeholder="Enter a title (max. 50 characters)"
                            {...studyProposalForm.getInputProps('title')}
                        />
                    </Group>

                    <Group align="flex-start">
                        <Text w={'20%'} fw="bold">
                            Study Lead
                        </Text>
                        <TextInput w={'30%'} aria-label="Study Lead" disabled value={user?.fullName ?? ''} />
                    </Group>

                    <Group align="flex-start">
                        <Text w={'20%'} fw="bold">
                            Principal Investigator
                        </Text>
                        <TextInput
                            w={'30%'}
                            aria-label="Principal Investigator"
                            placeholder="Full Name"
                            {...studyProposalForm.getInputProps('piName')}
                        />
                    </Group>

                    <Group align="flex-start">
                        <Text w={'20%'} fw="bold">
                            Study Description
                        </Text>
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
                        <Text w={'20%'} fw="bold">
                            IRB Document
                        </Text>
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
                        <Text w={'20%'} fw="bold">
                            Agreement Document
                        </Text>
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
            </Stack>
        </Paper>
    )
}
