'use client'

import { InputError } from '@/components/errors'
import { FormFieldLabel } from '@/components/form-field-label' // adjust path if needed
import { StudyOrgSelector } from '@/components/study/study-org-selector'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { ProgrammingLanguageSection } from '@/components/study/programming-language-section'
import { useUser } from '@clerk/nextjs'
import { Divider, FileInput, Grid, Group, Paper, Stack, Text, TextInput, Title, useMantineTheme } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { FileDocIcon, FilePdfIcon, FileTextIcon, UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import React, { FC } from 'react'
import { StudyProposalFormValues } from './step1-schema'

export type ExistingFilePaths = {
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
}

const ExistingFileIndicator: FC<{ path: string | null | undefined; newFile: File | null | undefined }> = ({
    path,
    newFile,
}) => {
    if (!path || newFile) return null
    const fileName = path.split('/').pop() || path
    return (
        <Group gap="xs" mt="xs" wrap="nowrap">
            <FileDocIcon size={14} style={{ flexShrink: 0 }} />
            <Text fz="xs" c="dimmed">
                Current: {fileName}
            </Text>
        </Group>
    )
}

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
    existingFiles?: ExistingFilePaths
}> = ({ studyProposalForm, existingFiles }) => {
    const { user } = useUser()
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

    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    return (
        <>
            <StudyOrgSelector form={studyProposalForm} />
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 2 of 5
                </Text>
                <Title order={4}>Study Proposal</Title>
                <Divider my="md" />
                <Stack gap="xl">
                    <Text>
                        This section is here to help you submit your study proposal. Consider providing as much detail
                        as possible to ensure the Reviewer has all the information needed to make an informed decision.
                    </Text>
                    <Grid align="flex-start">
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel label="Study Title" inputId={studyProposalForm.key('title')} />
                        </Grid.Col>
                        <Grid.Col span={inputSpan} miw={300}>
                            <TextInput
                                key={studyProposalForm.key('title')}
                                id={studyProposalForm.key('title')}
                                aria-label="Study Title"
                                placeholder="Enter a title (max. 50 characters)"
                                {...studyProposalForm.getInputProps('title')}
                                autoFocus
                            />
                        </Grid.Col>
                    </Grid>

                    <Grid align="flex-start">
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel label="Submitted by" inputId={studyProposalForm.key('lead')} />
                        </Grid.Col>
                        <Grid.Col span={inputSpan} miw={300}>
                            <TextInput
                                id={studyProposalForm.key('lead')}
                                aria-label="Study Lead"
                                styles={{
                                    input: {
                                        color: theme.colors.charcoal[9],
                                        backgroundColor: theme.colors.charcoal[1],
                                        borderColor: theme.colors.charcoal[1],
                                    },
                                }}
                                disabled
                                value={user?.fullName ?? ''}
                            />
                        </Grid.Col>
                    </Grid>

                    <Grid align="flex-start">
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel label="Principal Investigator" inputId={studyProposalForm.key('piName')} />
                        </Grid.Col>
                        <Grid.Col span={inputSpan} miw={300}>
                            <TextInput
                                key={studyProposalForm.key('piName')}
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
                        <Grid.Col span={inputSpan} miw={300}>
                            <FileInput
                                id={studyProposalForm.key('descriptionDocument')}
                                name="descriptionDocument"
                                leftSection={fileUpload}
                                aria-label="Upload Study Description Document"
                                placeholder="Upload document (max 5 MB)"
                                clearable
                                accept=".doc,.docx,.pdf"
                                {...studyProposalForm.getInputProps('descriptionDocument')}
                                onChange={(file) => {
                                    studyProposalForm.setFieldValue('descriptionDocument', file)
                                    studyProposalForm.validateField('totalFileSize')
                                }}
                            />
                            <ExistingFileIndicator
                                path={existingFiles?.descriptionDocPath}
                                newFile={studyProposalForm.values.descriptionDocument}
                            />
                        </Grid.Col>
                    </Grid>

                    <Grid align="flex-start">
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel label="IRB Document" inputId={studyProposalForm.key('irbDocument')} />
                        </Grid.Col>
                        <Grid.Col span={inputSpan} miw={300}>
                            <FileInput
                                id={studyProposalForm.key('irbDocument')}
                                leftSection={irbFileUpload}
                                name="irbDocument"
                                aria-label="Upload IRB Document"
                                placeholder="Upload document (max 3 MB)"
                                clearable
                                accept=".doc,.docx,.pdf"
                                {...studyProposalForm.getInputProps('irbDocument')}
                                onChange={(file) => {
                                    studyProposalForm.setFieldValue('irbDocument', file)
                                    studyProposalForm.validateField('totalFileSize')
                                }}
                            />
                            <ExistingFileIndicator
                                path={existingFiles?.irbDocPath}
                                newFile={studyProposalForm.values.irbDocument}
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
                        <Grid.Col span={inputSpan} miw={300}>
                            <FileInput
                                id={studyProposalForm.key('agreementDocument')}
                                leftSection={agreementFileUpload}
                                name="agreementDocument"
                                aria-label="Upload Agreement Document"
                                placeholder="Upload document (max 3 MB)"
                                clearable
                                accept=".doc,.docx,.pdf"
                                {...studyProposalForm.getInputProps('agreementDocument')}
                                onChange={(file) => {
                                    studyProposalForm.setFieldValue('agreementDocument', file)
                                    studyProposalForm.validateField('totalFileSize')
                                }}
                            />
                            <ExistingFileIndicator
                                path={existingFiles?.agreementDocPath}
                                newFile={studyProposalForm.values.agreementDocument}
                            />
                        </Grid.Col>

                        {studyProposalForm.errors['totalFileSize'] && (
                            <Grid.Col>
                                <InputError error={studyProposalForm.errors['totalFileSize']} />
                            </Grid.Col>
                        )}
                    </Grid>
                </Stack>
            </Paper>
            <ProgrammingLanguageSection form={studyProposalForm} />
        </>
    )
}
