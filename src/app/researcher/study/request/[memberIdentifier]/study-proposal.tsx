'use client'
import React, { useRef, useState } from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, FileInput, Flex, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { css } from '@/styles'
import { StudyProposalFormValues, studyProposalSchema, zodResolver } from './studyProposalSchema'

export const customLabel = css({
    fontSize: '18px',
    marginBottom: '10px',
})

export const StudyProposalForm: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId }) => {
    const router = useRouter()
    const fileRefs = {
        description: useRef<HTMLButtonElement>(null),
        irbDocument: useRef<HTMLButtonElement>(null),
        // TOO: Add agreement document
    }

    const [fileNames, setFileNames] = useState<{ [key: string]: string | null }>({
        description: null,
        irbDocument: null,
        // agreementDocument: null,
    })

    const handleFileChange = (key: string, file: File | null) => {
        setFileNames((prev) => ({
            ...prev,
            [key]: file ? file.name : null,
        }))
        studyProposalForm.setFieldValue(key as keyof StudyProposalFormValues, file)
    }

    const studyProposalForm = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalSchema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            piName: '',
            // studyLead: '',
            description: null,
            irbDocument: null,
            // TODO: Add agreement document
        },
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: StudyProposalFormValues) => await onCreateStudyAction(memberId, d),
        onSettled(result, error) {
            if (error || !result?.studyId) {
                studyProposalForm.setErrors({
                    title: error?.message || 'An error occurred',
                    // TOO: Add agreement document
                })
            } else {
                router.push(`/researcher/study/${result.studyId}/upload`)
            }
        },
    })

    return (
        <>
            <form onSubmit={studyProposalForm.onSubmit((values) => createStudy(values))}>
                <Paper p="xl">
                    <Text>Researcher Study Proposal</Text>
                    <Divider my="sm" mt="sm" mb="md" />
                    <Text>
                        This section is here to help you submit your study proposal. Consider providing as much detail
                        as possible to ensure the Reviewer has all the information needed to make an informed decision.
                    </Text>
                    <Group mt="xl">
                        <Stack>
                            <Group>
                                <Text>Study Title</Text>
                                <TextInput
                                    bd="1px solid #000000"
                                    placeholder="Enter a title (max. 50 characters)"
                                    required
                                    name="title"
                                    key={studyProposalForm.key('title')}
                                    {...studyProposalForm.getInputProps('title')}
                                    className={customLabel}
                                />
                            </Group>
                            <Group>
                                <Text>Study Lead</Text>
                                <TextInput
                                    bg="#ddd"
                                    bd="1px solid #000000"
                                    disabled
                                    name="study-lead"
                                    value="Researcher Name"
                                    // value={user?.firstName + ' ' + user?.lastName}
                                    data-testid="study-lead"
                                />
                            </Group>
                            <Group>
                                <Text>Principal Investigator</Text>
                                <TextInput
                                    bd="1px solid #000000"
                                    name="piName"
                                    required
                                    key={studyProposalForm.key('piName')}
                                    {...studyProposalForm.getInputProps('piName')}
                                    className={customLabel}
                                />
                            </Group>
                            <Group>
                                <Text>Study Description</Text>
                                <FileInput
                                    bd="1px solid #000000"
                                    ref={fileRefs.description}
                                    name="description"
                                    placeholder="Upload a document describing your study"
                                    required
                                    key={studyProposalForm.key('description')}
                                    {...studyProposalForm.getInputProps('description')}
                                    onChange={(file) => handleFileChange('description', file)}
                                    className={customLabel}
                                    style={{ display: 'none' }}
                                />
                                <Anchor
                                    component="button"
                                    onClick={() => fileRefs.description.current?.click()}
                                    underline="always"
                                >
                                    Upload
                                </Anchor>
                                {fileNames.description && <Text> {fileNames.description}</Text>}
                            </Group>
                            <Group>
                                <Text>IRB Document</Text>
                                <FileInput
                                    bd="1px solid #000000"
                                    ref={fileRefs.irbDocument}
                                    name="irbDocument"
                                    placeholder="Upload IRB approval document"
                                    required
                                    key={studyProposalForm.key('irbDocument')}
                                    {...studyProposalForm.getInputProps('irbDocument')}
                                    onChange={(file) => handleFileChange('irbDocument', file)}
                                    className={customLabel}
                                    style={{ display: 'none' }}
                                />
                                <Anchor
                                    component="button"
                                    onClick={() => fileRefs.irbDocument.current?.click()}
                                    underline="always"
                                >
                                    Upload
                                </Anchor>
                                {fileNames.irbDocument && <Text> {fileNames.irbDocument}</Text>}
                            </Group>
                            {/* <Text>Agreement Document</Text> TODO: Need Database column for this attribute */}
                            {/* <FileInput
                                    bd="1px solid #000000"
                                    ref={fileRefs.agreementDocument}
                                    name="agreementDocument"
                                    placeholder="Upload agreement document"
                                    required
                                    key={studyProposalForm.key('agreementDocument')}
                                    {...studyProposalForm.getInputProps('agreementDocument')}
                                    onChange={(file) => handleFileChange('agreementDocument', file)}
                                    className={customLabel}
                                    style={{ display: 'none' }}
                                />
                                <Anchor
                                    component="button"
                                    onClick={() => fileRefs.agreementDocument.current?.click()}
                                    underline="always"
                                >
                                    Upload
                                </Anchor>
                                {fileNames.agreementDocument && (
                                    <Text> {fileNames.agreementDocument}</Text>
                                )} */}
                        </Stack>
                        <Stack mt="md">
                            <Flex direction="column" gap="sm">
                                {/* TODO: Need Database column for this attribute */}
                                {/* <FileInput

                                                    bd="1px solid #000000"
                                                    name="agreementDocument"
                                                    placeholder="Upload agreement document"
                                                    required
                                                    key={form.key('agreementDocument')}
                                                    {...form.getInputProps('agreementDocument')}
                                                    className={customLabel}
                                                /> */}
                            </Flex>
                        </Stack>
                    </Group>
                </Paper>
                <Group gap="xl" p={2} mt="xl" justify="flex-end">
                    <Button
                        fz="lg"
                        mb="lg"
                        type="button"
                        onClick={() => router.push(`/`)}
                        variant="outline"
                        color="#616161"
                    >
                        Cancel
                    </Button>
                    <Button
                        fz="lg"
                        mb="lg"
                        type="submit"
                        disabled={!studyProposalForm.isValid}
                        variant="filled"
                        color="#616161"
                        loading={isPending}
                    >
                        Next
                    </Button>
                </Group>
            </form>
        </>
    )
}
