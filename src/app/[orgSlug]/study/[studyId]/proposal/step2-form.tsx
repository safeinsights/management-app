'use client'

import { FC } from 'react'
import { Anchor, Box, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm, zodResolver } from '@/common'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { DatasetMultiSelect, type DatasetOption } from '@/components/dataset-multi-select'
import { step2FormSchema, initialStep2Values, type Step2FormValues } from './step2-schema'

const DATA_CATALOG_URL = 'https://kb.safeinsights.org/data-catalog'
const MAX_TITLE_WORDS = 20

interface Step2FormProps {
    datasets?: DatasetOption[]
    orgName?: string
    initialValues?: Partial<Step2FormValues>
}

export const Step2Form: FC<Step2FormProps> = ({ datasets = [], orgName = '', initialValues }) => {
    const form = useForm<Step2FormValues>({
        validate: zodResolver(step2FormSchema),
        initialValues: {
            ...initialStep2Values,
            ...initialValues,
        },
        validateInputOnBlur: true,
        validateInputOnChange: true,
    })

    return (
        <Stack gap="xxl">
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    STEP 2
                </Text>
                <Title order={4}>Study proposal</Title>
                <Divider my="md" />

                <Text mb="xl">
                    Use this form to submit your study proposal. The information you share will help {orgName} assess
                    the feasibility, scientific value, and potential impact of your proposed research on instructional
                    practice. On review, they may approve or decline the request.
                </Text>

                <Stack gap="xxl">
                    <Box>
                        <FormFieldLabel label="Study title" required inputId="title" />
                        <Text size="sm" c="dimmed" mb="xs">
                            Give your study a short, clear title. This will help identify and reference your project on
                            SafeInsights.
                        </Text>
                        <TextInput
                            id="title"
                            aria-label="Study Title"
                            placeholder="Ex. Impact of highlighting on student learning outcomes."
                            {...form.getInputProps('title')}
                            error={!!form.errors.title}
                        />
                        <Group justify="space-between" mt={4}>
                            {form.errors.title ? <InputError error={form.errors.title} /> : <span />}
                            <WordCounter value={form.values.title} maxWords={MAX_TITLE_WORDS} />
                        </Group>
                    </Box>

                    <Box>
                        <FormFieldLabel label="Dataset(s) of interest" required inputId="datasets" />
                        <Text size="sm" c="dimmed" mb="xs">
                            Select one or more datasets relevant to your study.
                        </Text>
                        <Group align="center" gap="md">
                            <Box w="50%">
                                <DatasetMultiSelect
                                    options={datasets}
                                    value={form.values.datasets}
                                    onChange={(val) => form.setFieldValue('datasets', val)}
                                />
                            </Box>
                            <Anchor href={DATA_CATALOG_URL} target="_blank" size="sm" c="blue">
                                <Group gap={4} wrap="nowrap">
                                    Explore data catalog
                                    <ArrowSquareOutIcon size={14} />
                                </Group>
                            </Anchor>
                        </Group>
                        <InputError error={form.errors.datasets} />
                    </Box>
                </Stack>
            </Paper>
        </Stack>
    )
}
