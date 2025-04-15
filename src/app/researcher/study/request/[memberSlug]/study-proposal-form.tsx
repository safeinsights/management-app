'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import {
    Anchor,
    Divider,
    FileInput,
    Group,
    Grid,
    GridCol,
    Stack,
    Paper,
    Text,
    TextInput,
    Title,
    useMantineTheme,
} from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

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

            <Grid>
                <GridCol span="content">
                    <Stack gap="xl">
                        <Text fw="bold">Study Title</Text>
                        <Text mt="md" fw="bold">
                            Study Lead
                        </Text>
                        <Text mt="md" fw="bold">
                            Principal Investigator
                        </Text>
                        <Text fw="bold">Study Description</Text>
                        <Text fw="bold">IRB Document</Text>
                        <Text fw="bold">Agreement Document</Text>
                    </Stack>
                </GridCol>
                <GridCol span={3}>
                    <Stack gap="xl">
                        <TextInput
                            aria-label="Study Title"
                            placeholder="Enter a title (max. 50 characters)"
                            {...studyProposalForm.getInputProps('title')}
                        />
                        <TextInput aria-label="Study Lead" disabled value={user?.fullName ?? ''} />
                        <TextInput
                            aria-label="Principal Investigator"
                            placeholder="Full Name"
                            {...studyProposalForm.getInputProps('piName')}
                        />
                        <Group gap="md">
                            {fileUpload}
                            <FileInput
                                name="descriptionDocument"
                                component={Anchor}
                                aria-label="Upload Study Description Document"
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.pdf"
                                {...studyProposalForm.getInputProps('descriptionDocument')}
                            />
                        </Group>
                        <Group gap="md">
                            {irbFileUpload}
                            <FileInput
                                {...studyProposalForm.getInputProps('irbDocument')}
                                name="irbDocument"
                                component={Anchor}
                                aria-label="Upload IRB Document"
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.pdf"
                            />
                        </Group>
                        <Group gap="md">
                            {agreementFileUpload}
                            <FileInput
                                name="agreementDocument"
                                component={Anchor}
                                aria-label="Upload Agreement Document"
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.pdf"
                                {...studyProposalForm.getInputProps('agreementDocument')}
                            />
                        </Group>
                    </Stack>
                </GridCol>
            </Grid>
        </Paper>
    )
}
