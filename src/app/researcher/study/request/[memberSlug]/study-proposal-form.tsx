'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import {
    Anchor,
    Button,
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
import { FileDoc, FilePdf, FileText, UploadSimple, XCircle } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-schema'
import { theme } from '@/theme'

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

            <Grid>
                <GridCol span="content">
                    <Stack gap="xs">
                        <Title order={5} fz="sm">
                            Study Title
                        </Title>
                        <Title order={5} mt="md" fz="sm">
                            Study Lead
                        </Title>
                        <Title order={5} mt="sm" fz="sm">
                            Principal Investigator
                        </Title>
                        <Title order={5} mt="sm" fz="sm">
                            Study Description
                        </Title>
                        <Title order={5} mt="xl" fz="sm">
                            IRB Document
                        </Title>
                        <Title order={5} mt="xl" fz="sm">
                            Agreement Document
                        </Title>
                    </Stack>
                </GridCol>
                <GridCol span={3}>
                    <Stack gap="lg">
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
                        <Stack gap="xs">
                            <Group gap="md">
                                {fileUpload}
                                <FileInput
                                    name="descriptionDocument"
                                    component={Anchor}
                                    c="purple.5"
                                    aria-label="Upload Study Description Document"
                                    placeholder="Upload Document"
                                    clearable
                                    clearButtonProps={{
                                        children: <XCircle size={16} color={theme.colors.grey[2]} weight="fill" />,
                                        unstyled: true,
                                        hover: {
                                            background: 'transparent',
                                        },
                                      }}
                                    styles={{
                                        input: {
                                          color: theme.colors.blue[7],
                                          fontSize: 'inherit',
                                        },
                                      }}
                                    accept=".doc,.docx,.pdf"
                                    {...studyProposalForm.getInputProps('descriptionDocument')}
                                />
                                {/* <Button
                                variant="transparent"
                                    onClick={() =>
                                        studyProposalForm.setFieldValue('descriptionDocument', null)
                                    }
                                >
                                    <XCircle size={16} color={theme.colors.grey[2]} weight="fill" />
                                </Button> */}
                            </Group>
                            <Text fz="xs" c="grey.5">
                                Accepted formats: .doc, .docx, .pdf
                            </Text>
                        </Stack>
                        <Stack gap="xs">
                            <Group gap="lg">
                                {/* {irbFileUpload} */}
                                <FileInput
                                    {...studyProposalForm.getInputProps('irbDocument')}
                                    name="irbDocument"
                                    aria-label="Upload IRB Document"
                                    placeholder="Upload Document"
                                    leftSection={irbFileUpload}
                                    clearable
                                    styles={{
                                        input: {
                                          color: theme.colors.blue[7],
                                          marginleft: '0px',
                                          fontSize: '14px',
                                        },
                                      }}
                                    accept=".doc,.docx,.pdf"
                                />
                            </Group>
                            <Text fz="xs" c="grey.5">
                                Accepted formats: .doc, .docx, .pdf
                            </Text>
                        </Stack>
                        <Stack gap="xs" mt="xs">
                            <Group gap="md">
                                <FileInput
                                    name="agreementDocument"
                                    aria-label="Upload Agreement Document"
                                    placeholder="Upload Document"
                                    leftSection={agreementFileUpload}
                                    clearable
                                    styles={{
                                        input: {
                                          color: theme.colors.blue[7],
                                          marginleft: '0px',
                                          fontSize: '14px',
                                        },
                                      }}
                                    accept=".doc,.docx,.pdf"
                                    {...studyProposalForm.getInputProps('agreementDocument')}
                                />
                            </Group>
                            <Text fz="xs" c="grey.5">
                                Accepted formats: .doc, .docx, .pdf
                            </Text>
                        </Stack>
                    </Stack>
                </GridCol>
            </Grid>
        </Paper>
    )
}
