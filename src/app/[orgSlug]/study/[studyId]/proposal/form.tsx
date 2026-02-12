'use client'

import { FC } from 'react'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon, CheckCircleIcon } from '@phosphor-icons/react'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { EditableText } from '@/components/editable-text'
import ProxyProvider from '@/components/proxy-provider'
import { DatasetMultiSelect, type DatasetOption } from '@/components/dataset-multi-select'
import { countWords, countWordsFromLexical } from '@/lib/word-count'
import { Routes } from '@/lib/routes'
import { type ProposalFormValues } from './schema'
import { useProposal } from '@/contexts/proposal'
import { ProposalFooter } from './footer'

const DATA_CATALOG_URL = 'https://kb.safeinsights.org/data-catalog'
const MAX_TITLE_WORDS = 20

interface EditableTextField {
    label: string
    id: keyof ProposalFormValues
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

export interface MemberOption {
    value: string
    label: string
}

interface ProposalFormProps {
    datasets?: DatasetOption[]
    members?: MemberOption[]
    orgName?: string
    researcherName?: string
}

export const ProposalForm: FC<ProposalFormProps> = ({
    datasets = [],
    members = [],
    orgName = '',
    researcherName = '',
}) => {
    const { form, saveDraft, isSaving, isSubmitted } = useProposal()

    const titleWordCount = countWords(form.values.title)

    if (isSubmitted) {
        return (
            <Paper p="xl">
                <Stack align="center" gap="md" py="xl">
                    <CheckCircleIcon size={48} weight="fill" color="var(--mantine-color-green-6)" />
                    <Title order={3}>Study proposal submitted</Title>
                    <Text c="dimmed" ta="center" maw={480}>
                        Your proposal has been successfully submitted for review. You will be notified once a decision
                        has been made.
                    </Text>
                </Stack>
            </Paper>
        )
    }

    return (
        <ProxyProvider isDirty={form.isDirty()} onSaveDraft={saveDraft} isSavingDraft={isSaving}>
            <Stack gap="xxl">
                <Paper p="xl">
                    <Text fz="sm" fw={700} c="gray.6" pb="sm">
                        STEP 2
                    </Text>
                    <Title order={4}>Study proposal</Title>
                    <Divider my="md" />

                    <Text mb="xl">
                        Use this form to submit your study proposal. The information you share will help {orgName}{' '}
                        assess the feasibility, scientific value, and potential impact of your proposed research on
                        instructional practice. On review, they may approve or decline the request.
                    </Text>

                    <Stack gap="xxl">
                        <Box>
                            <FormFieldLabel label="Study title" required inputId="title" />
                            <Text size="sm" c="dimmed" mb="xs">
                                Give your study a short, clear title. This will help identify and reference your project
                                on SafeInsights.
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
                                        <ArrowSquareOutIcon size={16} weight="bold" />
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

                <Paper p="xl">
                    <Stack gap="xxl">
                        <Box>
                            <FormFieldLabel label="Principal Investigator" required inputId="piName" />
                            <Text size="sm" c="dimmed" mb="xs">
                                Select a Principal Investigator from your lab.
                            </Text>
                            <Box w="50%">
                                <Select
                                    id="piName"
                                    aria-label="Principal Investigator"
                                    placeholder="Choose a PI"
                                    searchable
                                    data={members}
                                    {...form.getInputProps('piName')}
                                />
                            </Box>
                        </Box>

                        <Box>
                            <FormFieldLabel label="Researcher" required inputId="researcher" />
                            <Text size="sm" c="dimmed" mb="xs">
                                Ensure that your profile is complete and updated.
                            </Text>
                            <Group align="center" gap="md">
                                <Box w="50%">
                                    <TextInput
                                        id="researcher"
                                        aria-label="Researcher"
                                        value={researcherName}
                                        disabled
                                    />
                                </Box>
                                <Anchor href={Routes.researcherProfile} target="_blank" size="sm" c="blue.7" fw={600}>
                                    <Group gap={4} wrap="nowrap">
                                        View profile
                                        <ArrowSquareOutIcon size={16} weight="bold" />
                                    </Group>
                                </Anchor>
                            </Group>
                        </Box>
                    </Stack>
                </Paper>

                <ProposalFooter />
            </Stack>
        </ProxyProvider>
    )
}
