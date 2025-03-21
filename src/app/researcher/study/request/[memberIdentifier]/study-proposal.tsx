'use client'
import React from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, FileInput, Group, Paper, Stack, Text } from '@mantine/core'
import { FileDoc, FileText, FilePdf, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { CancelButton } from '@/components/cancel-button'
import { TextInput } from '@/components/form'
import { StudyProposalFormValues, studyProposalSchema, zodResolver } from './study-proposal-schema'


//TODO: Finish - Update the file upload icon to match the file type of the document
const Icons: [RegExp, React.ReactNode][] = [
    [/\.docx?$/i, <FileDoc key="doc" size={14} color="#291bc4" />],
    [/\.txt$/i, <FileText key="txt" size={14} color="#291bc4" />],
    [/\.pdf$/i, <FilePdf key="pdf" size={14} color="#291bc4" />],
]

const getFileUploadIcon = (fileName?: string | null) => {
    if (!fileName) return <UploadSimple size={14} color="#291bc4" weight="fill" />

    const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
    return matchedIcon || <UploadSimple size={14} color="#291bc4" weight="fill" />
}

export const StudyProposalForm: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId }) => {
    const router = useRouter()

    const studyProposalForm = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalSchema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            piName: '',
            irbDocument: null,
            descriptionDocument: null,
            agreementDocument: null,
        },
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: StudyProposalFormValues) => await onCreateStudyAction(memberId, d),
        onSettled(result, error) {
            if (error || !result?.studyId) {
                studyProposalForm.setErrors({
                    title: error?.message || 'An error occurred',
                })
            } else {
                router.push(`/researcher/study/${result.studyId}/upload`)
            }
        },
    })

    const fileUpload = getFileUploadIcon(studyProposalForm.values.descriptionDocument?.name)
    const irbFileUpload = getFileUploadIcon(studyProposalForm.values.irbDocument?.name)
    const agreementFileUpload = getFileUploadIcon(studyProposalForm.values.agreementDocument?.name)

    return (
        <>
            <form onSubmit={studyProposalForm.onSubmit((values) => createStudy(values))}>
                <Paper p="xl">
                    <Text fz="xs" c="dimmed">
                        Step 1 of 2
                    </Text>
                    <Text fz="lg">Study Proposal</Text>
                    <Divider my="sm" mt="sm" mb="md" />
                    <Text>
                        This section is key to your proposal, as it defines the analysis that will generate the results
                        you’re intending to obtain from the Member’s data. Upload any necessary files to support your
                        analysis. In this iteration, we currently support .r and .rmd files.
                    </Text>
                    <Stack gap="lg" mt="md">
                        <Group gap="xl">
                            <Text>Study Title</Text>
                            <TextInput
                                horizontal
                                aria-label="Study Title"
                                placeholder="Enter a title (max. 50 characters)"
                                key={studyProposalForm.key('title')}
                                {...studyProposalForm.getInputProps('title')}
                            />
                        </Group>

                        <Group gap="xl">
                            <Text>Study Lead</Text>
                            <TextInput
                                horizontal
                                aria-label="Study Lead"
                                disabled
                                value="Researcher Name"
                                // value={user?.firstName + ' ' + user?.lastName}
                            />
                        </Group>

                        <Group gap="xl">
                            <Text>Principal Investigator</Text>
                            <TextInput
                                horizontal
                                key={studyProposalForm.key('piName')}
                                {...studyProposalForm.getInputProps('piName')}
                            />
                        </Group>

                        <Group>
                            <Text>Study Description</Text>
                            {fileUpload}
                            <Stack gap={0}>
                            <FileInput
                                name="descriptionDocument"
                                component={Anchor}
                                aria-label="Upload Study Description Document"
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.txt,.pdf"
                                key={studyProposalForm.key('descriptionDocument')}
                                {...studyProposalForm.getInputProps('descriptionDocument')}
                            />
                            <Text size="xs" c="dimmed">Accepted formats: doc, docx, pdf and txt</Text>
                            </Stack>
                        </Group>

                        <Group gap="xs">
                            <Text>IRB Document</Text>
                            {irbFileUpload}
                        <Stack gap={0}>
                            <FileInput
                                name="irbDocument"
                                component={Anchor}
                                aria-label="Upload IRB Document"
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.txt,.pdf"
                                key={studyProposalForm.key('irbDocument')}
                                {...studyProposalForm.getInputProps('irbDocument')}
                            />
                            <Text size="xs" c="dimmed">Accepted formats: doc, docx, pdf and txt</Text>
                            </Stack>
                        </Group>

                        <Group gap="xs">
                            <Text>Agreement Document</Text>
                            {agreementFileUpload}
                            <Stack gap={0}>
                            <FileInput
                                name="agreementDocument"
                                aria-label="Upload Agreement Document"
                                component={Anchor}
                                placeholder="Upload Document"
                                clearable
                                accept=".doc,.docx,.txt,.pdf"
                                key={studyProposalForm.key('agreementDocument')}
                                {...studyProposalForm.getInputProps('agreementDocument')}
                            />
                            <Text size="xs" c="dimmed">Accepted formats: doc, docx, pdf and txt</Text>
                            </Stack>
                        </Group>

                    </Stack>
                </Paper>
                <Group gap="xl" p={2} mt="xl" justify="flex-end">
                    <CancelButton
                        isDirty={studyProposalForm.isDirty()}
                        uploadedFiles={[
                            studyProposalForm.key('irbDocument'),
                            studyProposalForm.key('agreementDocument'),
                            studyProposalForm.key('description'),
                        ]}
                    />

                    <Button
                        fz="lg"
                        mb="lg"
                        type="submit"
                        disabled={!studyProposalForm.isValid()}
                        variant="filled"
                        color="#291bc4"
                        loading={isPending}
                    >
                        Next Step
                    </Button>
                </Group>
            </form>
        </>
    )
}
