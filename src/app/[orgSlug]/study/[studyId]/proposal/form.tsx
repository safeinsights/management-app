'use client'

import { FC, useState } from 'react'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { EditableText } from '@/components/editable-text'
import ProxyProvider from '@/components/proxy-provider'
import { DatasetMultiSelect, type DatasetOption } from '@/components/dataset-multi-select'
import { countWords } from '@/lib/word-count'
import { Routes, ExternalLinks } from '@/lib/routes'
import { WORD_LIMITS } from './schema'
import { useProposal } from '@/contexts/proposal'
import { ProposalFooter } from './footer'
import { editableTextFields, type EditableTextField } from './field-config'

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

const ProposalTextField: FC<{
    field: EditableTextField
    value: string
    error: string | undefined
    onChange: (val: string) => void
    onBlur: () => void
}> = ({ field, value, error, onChange, onBlur }) => {
    const [wordCount, setWordCount] = useState(0)

    return (
        <Paper p="xl">
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
                        value={value}
                        onChange={onChange}
                        onBlur={onBlur}
                        onWordCount={setWordCount}
                        error={!!error}
                    />
                    <Group justify={error ? 'space-between' : 'flex-end'} mt={4}>
                        {error && <InputError error={error} />}
                        <WordCounter wordCount={wordCount} maxWords={field.maxWords} />
                    </Group>
                </Box>
            </Stack>
        </Paper>
    )
}

export const ProposalForm: FC<ProposalFormProps> = ({
    datasets = [],
    members = [],
    orgName = '',
    researcherName = '',
}) => {
    const { form, saveDraft, isSaving } = useProposal()

    const titleWordCount = countWords(form.values.title)

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
                                <WordCounter wordCount={titleWordCount} maxWords={WORD_LIMITS.title} />
                            </Group>
                        </Box>

                        <Box>
                            <FormFieldLabel label="Dataset(s) of interest" inputId="datasets" />
                            <Text size="sm" c="dimmed" mb="xs">
                                Select one or more datasets relevant to your study.
                            </Text>
                            <Group align="center" gap="md">
                                <Box w="50%">
                                    <DatasetMultiSelect
                                        id="datasets"
                                        options={datasets}
                                        value={form.values.datasets}
                                        onChange={(val) => form.setFieldValue('datasets', val)}
                                    />
                                </Box>
                                <Anchor
                                    href={ExternalLinks.dataCatalog}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="sm"
                                    c="blue.7"
                                    fw={600}
                                >
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

                {editableTextFields.map((field) => (
                    <ProposalTextField
                        key={field.id}
                        field={field}
                        value={form.values[field.id] as string}
                        error={form.errors[field.id] as string | undefined}
                        onChange={(val) => form.setFieldValue(field.id, val)}
                        onBlur={() => form.validateField(field.id)}
                    />
                ))}

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
                                <Anchor
                                    href={Routes.researcherProfile}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="sm"
                                    c="blue.7"
                                    fw={600}
                                >
                                    <Group gap={4} wrap="nowrap">
                                        View profile
                                        <ArrowSquareOutIcon size={16} weight="bold" />
                                    </Group>
                                </Anchor>
                            </Group>
                        </Box>
                    </Stack>
                </Paper>

                <ProposalFooter researcherName={researcherName} />
            </Stack>
        </ProxyProvider>
    )
}
