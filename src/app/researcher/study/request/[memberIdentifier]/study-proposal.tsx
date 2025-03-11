'use client'
import React, { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useForm } from '@mantine/form'
import { TextInput, Button, Flex, Accordion, Stack, Text, Group, FileInput, Paper, Divider } from '@mantine/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { css } from '@/styles'
import { zodResolver, FormValues, schema } from './schema'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'
export const customLabel = css({
    fontSize: '18px',
    marginBottom: '10px',
})

export const StudyProposalForm: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId }) => {
    const router = useRouter()
    const { user } = useUser()
    const [activeSection, setActiveSection] = useState<string | null>(null)
    const studyProposalForm = useForm<FormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            piName: '',
            // studyCode: null,
        },
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: FormValues) => {
            if (!d.description) throw new Error('Study description document is required')
            if (!d.irbDocument) throw new Error('IRB document is required')
            if (!d.agreementDocument) throw new Error('Agreement document is required')
            return await onCreateStudyAction(memberId, d)
        },
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

    return (
        <>
            <Flex direction="column" justify="center">
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
                        Submit
                    </Button>
                </Group>
                <form onSubmit={studyProposalForm.onSubmit((values) => createStudy(values))}>
                    <Accordion
                        chevronPosition="left"
                        defaultValue={['study', 'code']}
                        variant="separated"
                        onChange={setActiveSection}
                    >
                        <Paper>
                            <Accordion.Item value="study">
                                <Accordion.Control>Researcher Study Proposal</Accordion.Control>
                                <Accordion.Panel>
                                    <Divider my="sm" mt="sm" mb="md" />
                                    <Text>
                                        This section is here to help you submit your study proposal. Consider providing
                                        as much detail as possible to ensure the Reviewer has all the information needed
                                        to make an informed decision.
                                    </Text>
                                    <Group mt="xl">
                                        <Stack>
                                            <Flex direction="column" gap="xl">
                                                <Text>Study Title</Text>
                                                <Text>Study Lead</Text>
                                                <Text>Principal Investigator</Text>
                                                <Text>Study Description</Text>
                                                <Text>IRB Document</Text>
                                                {/* <Text>Agreement Document</Text> TODO: Need Database column for this attribute */}
                                            </Flex>
                                        </Stack>
                                        <Stack mt="md">
                                            <Flex direction="column" gap="sm">
                                                <TextInput
                                                    placeholder="Enter a title (max. 50 characters)"
                                                    bd="1px solid #000000"
                                                    required
                                                    name="title"
                                                    key={studyProposalForm.key('title')}
                                                    {...studyProposalForm.getInputProps('title')}
                                                    className={customLabel}
                                                />

                                                <TextInput
                                                    bg="#ddd"
                                                    bd="1px solid #000000"
                                                    disabled
                                                    name="study-lead"
                                                    value={user?.firstName + ' ' + user?.lastName}
                                                    data-testid="study-lead"
                                                />

                                                <TextInput
                                                    bd="1px solid #000000"
                                                    name="piName"
                                                    required
                                                    key={studyProposalForm.key('piName')}
                                                    {...studyProposalForm.getInputProps('piName')}
                                                    className={customLabel}
                                                />

                                                <FileInput
                                                    bd="1px solid #000000"
                                                    name="description"
                                                    placeholder="Upload a document describing your study"
                                                    required
                                                    key={studyProposalForm.key('description')}
                                                    {...studyProposalForm.getInputProps('description')}
                                                    className={customLabel}
                                                />

                                                <FileInput
                                                    bd="1px solid #000000"
                                                    name="irbDocument"
                                                    placeholder="Upload IRB approval document"
                                                    required
                                                    key={studyProposalForm.key('irbDocument')}
                                                    {...studyProposalForm.getInputProps('irbDocument')}
                                                    className={customLabel}
                                                />

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
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Paper>

                        {/* Will be implememted fully in OTTER-85} */}
                        <Accordion.Item value="code" mt="xl">
                            <Accordion.Control>Study Code</Accordion.Control>
                            <Accordion.Panel>
                                <Divider my="sm" mt="sm" mb="md" />
                                {/* <Stack>
                                    <Text>
                                        This section is key to your proposal, as it defines the analysis that will
                                        generate the results you’re intending to obtain from the Member’s data. Upload
                                        any necessary files to support your analysis. In this iteration, we currently
                                        support .r and .rmd files.
                                    </Text>
                                    {/* <UploadStudyJobCode /> 
                                </Stack> */}
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </form>
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
                        Submit
                    </Button>
                </Group>
            </Flex>
        </>
    )
}
