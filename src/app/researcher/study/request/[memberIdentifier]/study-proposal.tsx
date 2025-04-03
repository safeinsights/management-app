'use client'

import React, { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import {
    Anchor,
    Divider,
    FileInput,
    Flex,
    Group,
    Paper,
    Table,
    Text,
    TextInput,
    Title,
    useMantineTheme,
} from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'

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
            <Flex>
                <Table variant="vertical" withRowBorders={false}>
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">Study Title</Text>
                            </Table.Th>
                            <Table.Td>
                                <TextInput
                                    aria-label="Study Title"
                                    placeholder="Enter a title (max. 50 characters)"
                                    {...studyProposalForm.getInputProps('title')}
                                />
                            </Table.Td>
                            <Table.Td style={{ width: '70%' }}></Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">Study Lead</Text>
                            </Table.Th>
                            <Table.Td>
                                <TextInput aria-label="Study Lead" disabled value={user?.fullName ?? ''} />
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">Principal Investigator</Text>
                            </Table.Th>
                            <Table.Td>
                                <TextInput
                                    aria-label="Principal Investigator"
                                    placeholder="Full Name"
                                    {...studyProposalForm.getInputProps('piName')}
                                />
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">Study Description</Text>
                            </Table.Th>
                            <Table.Td>
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
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">IRB Approval</Text>
                            </Table.Th>
                            <Table.Td>
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
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th style={{ width: '10%' }} bg="white">
                                <Text fw="bold">Agreement</Text>
                            </Table.Th>
                            <Table.Td>
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
                            </Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>
            </Flex>
        </Paper>
    )
}
