'use client'
import React from 'react'
import { useForm } from '@mantine/form'
import { TextInput } from '@/components/form'
import { Anchor, Button, Divider, FileInput, Flex, Group, Paper, Stack, Text } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { StudyProposalFormValues, studyProposalSchema, zodResolver } from './studyProposalSchema'

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

                            <TextInput
                                horizontal
                                label="Study Title"
                                placeholder="Enter a title (max. 50 characters)"
                                key={studyProposalForm.key('title')}
                                {...studyProposalForm.getInputProps('title')}
                            />


                            <TextInput
                                horizontal
                                label="Study Lead"
                                disabled
                                value="Researcher Name"
                            // value={user?.firstName + ' ' + user?.lastName}
                            />

                            <TextInput
                                horizontal
                                label="Principal Investigator"
                                key={studyProposalForm.key('piName')}
                                {...studyProposalForm.getInputProps('piName')}
                            />



                            <FileInput
                                label="Study Description"
                                name='description-doc'
                                component={Anchor}
                                placeholder="Upload a document describing your study"
                                key={studyProposalForm.key('description')}
                                {...studyProposalForm.getInputProps('description')}
                                onChange={(file) => handleFileChange('description', file)}
                            />


                            <FileInput
                                label="IRB Document"
                                name='irb-doc'

                                component={Anchor}
                                placeholder="Upload IRB approval document"
                                key={studyProposalForm.key('irbDocument')}
                                {...studyProposalForm.getInputProps('irbDocument')}
                                onChange={(file) => handleFileChange('irbDocument', file)}
                            />

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
                            <Flex direction="column" gap="sm">
                                {/* TODO: Need Database column for this attribute */}
                                {/* <FileInput

                                                    placeholder="Upload agreement document"
                                                    required
                                                    key={form.key('agreementDocument')}
                                                    {...form.getInputProps('agreementDocument')}
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
