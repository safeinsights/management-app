'use client'

import { FC } from 'react'
import { Anchor, Box, Divider, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm, zodResolver } from '@/common'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { EditableText } from '@/components/editable-text'
import { DatasetMultiSelect, type DatasetOption } from '@/components/dataset-multi-select'
import { countWords, countWordsFromLexical } from '@/lib/word-count'
import { step2FormSchema, initialStep2Values, type Step2FormValues } from './step2-schema'

const DATA_CATALOG_URL = 'https://kb.safeinsights.org/data-catalog'
const MAX_TITLE_WORDS = 20

interface EditableTextField {
    label: string
    id: keyof Step2FormValues
    description: string
    placeholder: string
    maxWords: number
    required?: boolean
}

const editableTextFields: EditableTextField[] = [
    {
        label: 'Research question(s)',
        id: 'researchQuestions',
        description:
            'Describe the primary research question(s) your study aims to answer. Be as specific as possible to support review and alignment with available data.',
        placeholder:
            'Ex. How do textbook highlights correspond to student performance on assessments when the assessment directly is grounded in the highlighted content?',
        maxWords: 500,
        required: true,
    },
    {
        label: 'Project summary',
        id: 'projectSummary',
        description:
            'Briefly explain your planned study, including the target population, research design, methods, and any interventions or comparisons.',
        placeholder:
            'Ex. This secondary research hopes to examine how textbook highlighting relates to student performance using archival data from your online homework system.',
        maxWords: 1000,
        required: true,
    },
    {
        label: 'Impact',
        id: 'impact',
        description:
            'What are the potential outcomes of this study? Describe how your findings could improve learning experiences, teaching practices, educational policy, etc.',
        placeholder:
            'Ex. How students encode information during highlighting and what impact it has on subsequent retention has a contentious literature.',
        maxWords: 500,
        required: true,
    },
    {
        label: 'Additional notes or requests',
        id: 'additionalNotes',
        description:
            'Add any other information, constraints, or questions for the Data Organization. This might include timing, special requirements, references, or related work.',
        placeholder:
            'Ex. This project is based on grants, so we are operating under specific timelines, reporting requirements, and budget constraints.',
        maxWords: 300,
        required: false,
    },
]

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

    const titleWordCount = countWords(form.values.title)

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
                        <Group justify={form.errors.title ? 'space-between' : 'flex-end'} mt={4}>
                            {form.errors.title && <InputError error={form.errors.title} />}
                            <WordCounter wordCount={titleWordCount} maxWords={MAX_TITLE_WORDS} />
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
                            <Anchor href={DATA_CATALOG_URL} target="_blank" size="sm" c="blue.7" fw={600}>
                                <Group gap={4} wrap="nowrap">
                                    Explore data catalog
                                    <ArrowSquareOutIcon size={14} weight="bold" />
                                </Group>
                            </Anchor>
                        </Group>
                        <InputError error={form.errors.datasets} />
                    </Box>
                </Stack>
            </Paper>

            {editableTextFields.map((field) => {
                const wordCount = countWordsFromLexical(form.values[field.id] as string)

                return (
                    <Paper p="xl" key={field.id}>
                        <Stack gap="xxl">
                            <Box>
                                <FormFieldLabel label={field.label} required={field.required} inputId={field.id} />
                                <Text size="sm" c="dimmed" mb="xs">
                                    {field.description}
                                </Text>
                                <EditableText
                                    id={field.id}
                                    aria-label={field.label}
                                    placeholder={field.placeholder}
                                    value={form.values[field.id] as string}
                                    onChange={(val) => form.setFieldValue(field.id, val)}
                                    onBlur={() => form.validateField(field.id)}
                                    error={!!form.errors[field.id]}
                                />
                                <Group justify={form.errors[field.id] ? 'space-between' : 'flex-end'} mt={4}>
                                    {form.errors[field.id] && <InputError error={form.errors[field.id]} />}
                                    <WordCounter wordCount={wordCount} maxWords={field.maxWords} />
                                </Group>
                            </Box>
                        </Stack>
                    </Paper>
                )
            })}
        </Stack>
    )
}
