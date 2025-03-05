'use client'
import React, { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useForm } from '@mantine/form'
import { TextInput, Button, Flex, Accordion, Stack, Text, Group, FileInput, Paper } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { onCreateStudyAction } from './actions'
import { css } from '@/styles'
import { zodResolver, FormValues, schema } from './schema'
import { Divider } from '@/styles/generated/jsx/divider'
import { UploadStudyJobCode } from '@/components/upload-study-job-code'
export const customLabel = css({
    fontSize: '18px',
    marginBottom: '10px',
})

export const Form: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId }) => {
    const router = useRouter()
    const { user } = useUser()
    const [activeSection, setActiveSection] = useState<string | null>(null)
    const form = useForm<FormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            description: '',
            piName: '',
        },
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: FormValues) => await onCreateStudyAction(memberId, d),
        onSettled(result, error) {
            if (error || !result?.studyId) {
                form.setErrors({
                    title: error?.message || 'An error occurred',
                })
            } else {
                router.push(`/researcher/study/${result.studyId}/upload`)
            }
        },
    })

    return (
        <>
            <Flex direction="column" w="100%" justify="center">
                <Group gap="xl" p={2} mt={30} justify="flex-end">
                    <Button
                        fz="lg"
                        mb={20}
                        w={248}
                        type="button"
                        onClick={() => router.back()}
                        variant="outline"
                        color="#616161"
                    >
                        Cancel
                    </Button>
                    <Button
                        fz="lg"
                        mb={20}
                        w={248}
                        type="submit"
                        disabled={!form.isValid}
                        variant="filled"
                        color="#616161"
                        loading={isPending}
                    >
                        Submit
                    </Button>
                </Group>
                <form onSubmit={form.onSubmit((values) => createStudy(values))}>
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
                                    <Divider my="sm" mt={2} mb={5} />
                                    <Text w="90%">
                                        This section is here to help you submit your study proposal. Consider providing
                                        as much detail as possible to ensure the Reviewer has all the information needed
                                        to make an informed decision.
                                    </Text>
                                    <Group mt={30}>
                                        <Stack>
                                            <Flex direction="column" gap="xl">
                                                <Text>Study Title</Text>
                                                <Text>Study Lead</Text>
                                                <Text>Principal Investigator</Text>
                                                <Text>Study Description</Text>
                                                <Text>IRB Document</Text>
                                                <Text>Agreement Document</Text>
                                            </Flex>
                                        </Stack>
                                        <Stack mt={10}>
                                            <Flex direction="column" gap="sm">
                                                <TextInput
                                                    placeholder="Enter a title (max. 50 characters)"
                                                    w={536}
                                                    bd="1px solid #000000"
                                                    required
                                                    name="title"
                                                    key={form.key('title')}
                                                    {...form.getInputProps('title')}
                                                    className={customLabel}
                                                />

                                                <TextInput
                                                    w={536}
                                                    bg="#ddd"
                                                    bd="1px solid #000000"
                                                    disabled
                                                    name="title"
                                                    // value={user?.emailAddresses[0].emailAddress}
                                                    value={user?.firstName + ' ' + user?.lastName}
                                                    data-testid="study-lead"
                                                />

                                                <TextInput
                                                    w={536}
                                                    bd="1px solid #000000"
                                                    name="piName"
                                                    required
                                                    key={form.key('piName')}
                                                    {...form.getInputProps('piName')}
                                                    className={customLabel}
                                                />

                                                <FileInput
                                                    w={536}
                                                    bd="1px solid #000000"
                                                    name="description"
                                                    required
                                                    key={form.key('description')}
                                                    {...form.getInputProps('description')}
                                                    className={customLabel}
                                                />

                                                <FileInput
                                                    w={536}
                                                    bd="1px solid #000000"
                                                    name="irbDocument"
                                                    required
                                                    key={form.key('irbDocument')}
                                                    {...form.getInputProps('irbDocument')}
                                                    className={customLabel}
                                                />

                                                <FileInput
                                                    w={536}
                                                    bd="1px solid #000000"
                                                    name="agreementDocument"
                                                    required
                                                    key={form.key('agreementDocument')}
                                                    {...form.getInputProps('agreementDocument')}
                                                    className={customLabel}
                                                />
                                            </Flex>
                                        </Stack>
                                    </Group>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Paper>
                        <Accordion.Item value="code" mt={20}>
                            <Accordion.Control>Study Code</Accordion.Control>
                            <Accordion.Panel>
                                <Divider my="sm" mt={2} mb={5} />
                                <Stack>
                                    <Text w="90%">
                                        This section is key to your proposal, as it defines the analysis that will
                                        generate the results you’re intending to obtain from the Member’s data. Upload
                                        any necessary files to support your analysis. In this iteration, we currently
                                        support .r and .rmd files.
                                    </Text>
                                    <UploadStudyJobCode />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </form>
                <Group gap="xl" p={2} mt={30} justify="flex-end">
                    <Button
                        fz="lg"
                        mb={20}
                        w={248}
                        type="button"
                        onClick={() => router.back()}
                        variant="outline"
                        color="#616161"
                    >
                        Cancel
                    </Button>
                    <Button
                        fz="lg"
                        mb={20}
                        w={248}
                        type="submit"
                        disabled={!form.isValid}
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
