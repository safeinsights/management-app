'use client'

import { inputStyle, labelStyle } from './style.css'
import { Checkbox, Textarea, TextInput, Button, Flex, Group, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { onUpdateStudyAction } from './actions'
import { FormValues, schema, zodResolver } from './schema'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'

export const Form: React.FC<{ studyId: string; study: FormValues }> = ({ studyId, study }) => {
    const { mutate: updateStudy, isPending } = useMutation({
        mutationFn: async (data: FormValues) => await onUpdateStudyAction(studyId, data),
    })

    const form = useForm<FormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        initialValues: {
            highlights: true,
            eventCapture: true,
            irbDocument: 'IRB Document.pdf',
            ...study,
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => updateStudy(values))}>
            <Stack>
                <Text size="xl" fz="30px" ta="left" mb={30}>
                    OpenStax Study Proposal Step 3)
                </Text>
                <Text size="xl" ta="left">
                    STUDY DETAILS
                </Text>

                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle}>Study Title</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        disabled
                        className={inputStyle}
                        data-testid="study-title"
                        key={form.key('title')}
                        {...form.getInputProps('title')}
                        readOnly
                    />
                </Flex>

                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle} component="span">
                        Study Description
                        <Text component="span" c="red" inherit>
                            *
                        </Text>
                    </Text>
                    <Textarea
                        className={inputStyle}
                        name="description"
                        label=""
                        key={form.key('description')}
                        {...form.getInputProps('description')}
                    />
                </Flex>

                <Flex p={2} gap="md">
                    <Text className={labelStyle} component="span">
                        Principal Investigator
                        <Text component="span" c="red" inherit>
                            *
                        </Text>
                    </Text>
                    <TextInput
                        className={inputStyle}
                        name="piName"
                        key={form.key('piName')}
                        {...form.getInputProps('piName')}
                    />
                </Flex>
                <Group p={2} gap="md">
                    <Text className={labelStyle}>IRB Approval Documentation</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        disabled
                        className={inputStyle}
                        name="irbDocument"
                        key={form.key('irbDocument')}
                        {...form.getInputProps('irbDocument')}
                        readOnly
                    />
                    <Text fs="italic" c="dimmed" w="20%">
                        {'For the pilot, we are skipping the IRB step'}
                    </Text>
                </Group>
            </Stack>

            <Text size="xl" ta="left" mt={50} mb={10}>
                REQUESTED DATA DETAILS
            </Text>
            <Stack align="stretch">
                <Flex p={2} gap="lg">
                    <Text className={labelStyle} component="span">
                        Datasets of Interest
                        <Text component="span" c="red" inherit>
                            *
                        </Text>
                    </Text>
                    <Stack>
                        <Checkbox
                            name="highlights"
                            label="Highlights and Notes"
                            key={form.key('highlights')}
                            {...form.getInputProps('highlights', { type: 'checkbox' })}
                        ></Checkbox>
                        <Checkbox
                            name="eventCapture"
                            label="Event Capture"
                            key={form.key('eventCapture')}
                            {...form.getInputProps('eventCapture', { type: 'checkbox' })}
                            error={form.errors['dataSources']}
                        ></Checkbox>
                    </Stack>
                </Flex>
                <Flex p={2} gap="md" wrap="wrap">
                    <Text className={labelStyle}>Container URL</Text>
                    <TextInput
                        bg="#ddd"
                        bd="1px solid #ccc"
                        disabled
                        className={inputStyle}
                        name="containerLocation"
                        {...form.getInputProps('containerLocation')}
                        data-testid="container-location"
                        readOnly
                    />
                </Flex>
            </Stack>

            <Group gap="xl" p={2} mt={40} justify="flex-end">
                <Link href="/researcher/studies" passHref>
                    <Button disabled={!form.isValid || isPending}>Back to all studies</Button>
                </Link>
                <Button disabled={!form.isValid || isPending} type="submit" variant="default">
                    Submit Proposal
                </Button>
            </Group>
        </form>
    )
}
