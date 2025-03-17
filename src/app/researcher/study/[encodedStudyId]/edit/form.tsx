'use client'

import { Checkbox, Textarea, TextInput, Button, Flex, Group, Stack, Text, Paper, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { onUpdateStudyAction } from './actions'
import { FormValues, schema, zodResolver } from './schema'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { css } from '@/styles'

export const labelStyle = css({
    width: '10rem',
})

export const inputStyle = css({
    width: '20rem',
})

export const Form: React.FC<{ studyId: string; study: FormValues }> = ({ studyId, study }) => {
    const { mutate: updateStudy, isPending } = useMutation({
        mutationFn: async (data: FormValues) => await onUpdateStudyAction(studyId, data),
    })

    const form = useForm<FormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        initialValues: study,
    })

    return (
        <form onSubmit={form.onSubmit((values) => updateStudy(values))}>
            <Paper p="md" mb="md">
                <Title>Study Details</Title>
            </Paper>
            <Paper p="md">
                <Stack>
                    <Text size="xl" ta="left">
                        Study Proposal
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
                        <Text className={labelStyle}>Study Lead</Text>
                        <TextInput
                            bg="#ddd"
                            bd="1px solid #ccc"
                            disabled
                            className={inputStyle}
                            data-testid="study-title"
                            key={form.key('study-lead')}
                            {...form.getInputProps('study-lead')}
                            readOnly
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
                            bg="#ddd"
                            bd="1px solid #ccc"
                            className={inputStyle}
                            name="piName"
                            disabled
                            data-testid="piName"
                            key={form.key('piName')}
                            {...form.getInputProps('piName')}
                        />
                    </Flex>
                    <Flex p={2} gap="md" wrap="wrap">
                        <Text className={labelStyle} component="span">
                            Study Description
                            <Text component="span" c="red" inherit>
                                *
                            </Text>
                        </Text>
                        <TextInput
                            bg="#ddd"
                            bd="1px solid #ccc"
                            className={inputStyle}
                            name="description"
                            disabled
                            label=""
                            key={form.key('description')}
                            {...form.getInputProps('description')}
                            readOnly
                        />
                    </Flex>

                    <Group p={2} gap="md">
                        <Text className={labelStyle}>IRB Document</Text>
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
                    </Group>
                </Stack>
            </Paper>
            <Group gap="xl" p={2} mt={40} justify="flex-end">
                <Link href="/researcher/dashboard" passHref>
                    <Button disabled={!form.isValid || isPending}>Back to all studies</Button>
                </Link>
                <Button disabled={!form.isValid || isPending} type="submit" variant="default">
                    Submit Proposal
                </Button>
            </Group>
        </form>
    )
}
