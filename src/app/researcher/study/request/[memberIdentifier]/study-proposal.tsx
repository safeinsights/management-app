'use client'
import React from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Divider, FileInput, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
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

    const handleFileChange = (key: string, file: File | null) => {
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
                                    placeholder="Enter a title (max. 50 characters)"
                                    key={studyProposalForm.key('title')}
                                    {...studyProposalForm.getInputProps('title')}
                                />
                            </Group>
                            <Group>
                                <Text>Study Lead</Text>
                                <TextInput
                                    disabled
                                    value="Researcher Name"
                                    // value={user?.firstName + ' ' + user?.lastName}
                                />
                            </Group>
                            <Group>
                                <Text>Principal Investigator</Text>
                                <TextInput
                                    key={studyProposalForm.key('piName')}
                                    {...studyProposalForm.getInputProps('piName')}
                                />
                            </Group>
                            <Group>
                                <Text>Study Description</Text>
                                <FileInput
                                    component={Anchor}
                                    placeholder="Upload a document describing your study"
                                    key={studyProposalForm.key('description')}
                                    {...studyProposalForm.getInputProps('description')}
                                    onChange={(file) => handleFileChange('description', file)}
                                />
                            </Group>
                            <Group>
                                <Text>IRB Document</Text>
                                <FileInput
                                    component={Anchor}
                                    placeholder="Upload IRB approval document"
                                    key={studyProposalForm.key('irbDocument')}
                                    {...studyProposalForm.getInputProps('irbDocument')}
                                    onChange={(file) => handleFileChange('irbDocument', file)}
                                />
                            </Group>
                            {/* <Text>Agreement Document</Text> TODO: Need Database column for this attribute */}
                            {/* <FileInput
                                    ref={fileRefs.agreementDocument}
                                    placeholder="Upload agreement document"
                                    required
                                    key={studyProposalForm.key('agreementDocument')}
                                    {...studyProposalForm.getInputProps('agreementDocument')}
                                    onChange={(file) => handleFileChange('agreementDocument', file)}
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
                            <Stack gap="sm">
                                {/* TODO: Need Database column for this attribute */}
                                {/* <FileInput

                                                    placeholder="Upload agreement document"
                                                    required
                                                    key={form.key('agreementDocument')}
                                                    {...form.getInputProps('agreementDocument')}
                                                /> */}
                            </Stack>
                        </Stack>
                    </Group>
                </Paper>
                <Group gap="xl" p={2} mt="xl" justify="flex-end">
                    {/*<CancelButton isDirty={studyProposalForm.isDirty} */}
                    {/*              uploadedFiles={[*/}
                    {/*                  studyProposalForm.key('irbDocument'), */}
                    {/*                  studyProposalForm.key('agreementDocument'), */}
                    {/*                  studyProposalForm.key('description')*/}
                    {/*              ]} />*/}

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
