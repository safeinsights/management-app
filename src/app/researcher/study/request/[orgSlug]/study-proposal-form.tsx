'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Grid, Paper, Stack, Text, TextInput, Title, useMantineTheme } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

const FormLabel = ({ label }: { label: string }) => {
    return (
        <Title order={5} fw="semibold" style={{ overflowWrap: 'normal' }}>
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

    const titleSpan = { base: 12, sm: 4, lg: 2 }
    const inputSpan = { base: 12, sm: 8, lg: 4 }

    return (
        <Paper p="xl">
            <Title order={4}>Study Proposal</Title>
            <Divider my="md" />
            <Stack gap="xl">
                <Text>
                    This section is here to help you submit your study proposal. Consider providing as much detail as
                    possible to ensure the Reviewer has all the information needed to make an informed decision.
                </Text>
                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="Study Title" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput
                            aria-label="Study Title"
                            placeholder="Enter a title (max. 50 characters)"
                            {...studyProposalForm.getInputProps('title')}
                            maxLength={50}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="Study Lead" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput aria-label="Study Lead" disabled value={user?.fullName ?? ''} />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="Principal Investigator" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput
                            aria-label="Principal Investigator"
                            placeholder="Full Name (max. 100 characters)"
                            {...studyProposalForm.getInputProps('piName')}
                            maxLength={100}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="Study Description" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            name="descriptionDocument"
                            leftSection={fileUpload}
                            aria-label="Upload Study Description Document"
                            placeholder="Upload Study Description Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                            {...studyProposalForm.getInputProps('descriptionDocument')}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="IRB Document" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            leftSection={irbFileUpload}
                            {...studyProposalForm.getInputProps('irbDocument')}
                            name="irbDocument"
                            aria-label="Upload IRB Document"
                            placeholder="Upload IRB Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormLabel label="Agreement Document" />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            leftSection={agreementFileUpload}
                            name="agreementDocument"
                            aria-label="Upload Agreement Document"
                            placeholder="Upload Agreement Document"
                            clearable
                            accept=".doc,.docx,.pdf"
                            {...studyProposalForm.getInputProps('agreementDocument')}
                        />
                    </Grid.Col>
                </Grid>
            </Stack>
        </Paper>
    )
}
