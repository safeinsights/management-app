'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Grid, Paper, Stack, TextInput, Title, useMantineTheme, Text } from '@mantine/core'
import { FormFieldLabel } from '@/components/form-field-label' // adjust path if needed
import { FileDocIcon, FilePdfIcon, FileTextIcon, UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}> = ({ studyProposalForm }) => {
    const theme = useMantineTheme()
    const color = theme.colors.blue[7]

    const getFileUploadIcon = (color: string, fileName?: string | null) => {
        if (!fileName) return <UploadSimpleIcon size={14} color={theme.colors.purple[5]} weight="fill" />
        const Icons: [RegExp, React.ReactNode][] = [
            [/\.docx?$/i, <FileDocIcon key="doc" size={14} color={color} />],
            [/\.txt$/i, <FileTextIcon key="txt" size={14} color={color} />],
            [/\.pdf$/i, <FilePdfIcon key="pdf" size={14} color={color} />],
        ]
        const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
        return matchedIcon || <UploadSimpleIcon size={14} color={color} weight="fill" />
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
                        <FormFieldLabel label="Study Title" inputId={studyProposalForm.key('title')} />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput
                            id={studyProposalForm.key('title')}
                            aria-label="Study Title"
                            placeholder="Enter a title (max. 50 characters)"
                            {...studyProposalForm.getInputProps('title')}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Submitted by" inputId={studyProposalForm.key('lead')} />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput
                            id={studyProposalForm.key('lead')}
                            aria-label="Study Lead"
                            disabled
                            value={user?.fullName ?? ''}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel label="Principal Investigator" inputId={studyProposalForm.key('piName')} />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <TextInput
                            id={studyProposalForm.key('piName')}
                            aria-label="Principal Investigator"
                            placeholder="Full Name (max. 100 characters)"
                            {...studyProposalForm.getInputProps('piName')}
                        />
                    </Grid.Col>
                </Grid>

                <Grid align="flex-start">
                    <Grid.Col span={titleSpan}>
                        <FormFieldLabel
                            label="Study Description"
                            inputId={studyProposalForm.key('descriptionDocument')}
                        />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            id={studyProposalForm.key('descriptionDocument')}
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
                        <FormFieldLabel label="IRB Document" inputId={studyProposalForm.key('irbDocument')} />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            id={studyProposalForm.key('irbDocument')}
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
                        <FormFieldLabel
                            label="Agreement Document"
                            inputId={studyProposalForm.key('agreementDocument')}
                        />
                    </Grid.Col>
                    <Grid.Col span={inputSpan}>
                        <FileInput
                            id={studyProposalForm.key('agreementDocument')}
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
