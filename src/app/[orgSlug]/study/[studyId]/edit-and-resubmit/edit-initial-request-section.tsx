'use client'

import { FC, useState } from 'react'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { EditableText } from '@/components/editable-text'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { countWords } from '@/lib/word-count'
import { Routes, ExternalLinks } from '@/lib/routes'
import {
    DEFAULT_DRAFT_TITLE,
    WORD_LIMITS,
    type ProposalFormValues,
} from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { editableTextFields, type EditableTextField } from '@/app/[orgSlug]/study/[studyId]/proposal/field-config'

export interface MemberOption {
    value: string
    label: string
}

interface EditInitialRequestSectionProps {
    orgName: string
    members: MemberOption[]
    researcherName: string
    enclaveOrgSlug?: string
}

const EditableField: FC<{
    field: EditableTextField
    value: string
    error: string | undefined
    onChange: (val: string) => void
    onBlur: () => void
}> = ({ field, value, error, onChange, onBlur }) => {
    const [wordCount, setWordCount] = useState(0)

    return (
        <Box>
            <FormFieldLabel label={field.label} required={field.required} inputId={field.id} />
            <Text size="xs" c="charcoal.7" mb="xs">
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
    )
}

export const EditInitialRequestSection: FC<EditInitialRequestSectionProps> = ({
    orgName,
    members,
    researcherName,
    enclaveOrgSlug,
}) => {
    const { form } = useEditResubmit()
    const titleWordCount = countWords(form.values.title)

    const setProposalField = (key: keyof ProposalFormValues, value: unknown) => form.setFieldValue(key, value as never)

    return (
        <Paper p="xxl" data-testid="edit-initial-request-section">
            <Stack gap="xxl">
                <Box>
                    <Title order={4} c="charcoal.9">
                        Edit Initial Request
                    </Title>
                    <Divider my="md" />
                    <Text mb="xl">
                        Use this form to revise your study proposal in response to {orgName}. Auto-saving keeps your
                        progress while you work.
                    </Text>
                </Box>

                <Box>
                    <FormFieldLabel label="Study title" required inputId="title" />
                    <Text size="xs" c="charcoal.7" mb="xs">
                        Give your study a short, clear title.
                    </Text>
                    <TextInput
                        id="title"
                        aria-label="Study Title"
                        placeholder="Ex. Impact of highlighting on student learning outcomes."
                        {...form.getInputProps('title')}
                        value={form.values.title === DEFAULT_DRAFT_TITLE ? '' : form.values.title}
                        error={!!form.errors.title}
                    />
                    <Group justify={form.errors.title ? 'space-between' : 'flex-end'} mt={4}>
                        {form.errors.title && <InputError error={form.errors.title as string} />}
                        <WordCounter wordCount={titleWordCount} maxWords={WORD_LIMITS.title} />
                    </Group>
                </Box>

                <Box>
                    <FormFieldLabel label="Dataset(s) of interest" required inputId="datasets" />
                    <Text size="xs" mb="xs" c="charcoal.7">
                        Select the dataset(s) you&apos;d like to use for your research.
                    </Text>
                    <Group align="center" gap="xxl">
                        <Box w="50%">
                            <DatasetMultiSelect
                                id="datasets"
                                value={form.values.datasets}
                                onChange={(val) => setProposalField('datasets', val)}
                                orgSlug={enclaveOrgSlug}
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
                    <InputError error={form.errors.datasets as string | undefined} />
                </Box>

                {editableTextFields.map((field) => (
                    <EditableField
                        key={field.id}
                        field={field}
                        value={form.values[field.id] as string}
                        error={form.errors[field.id] as string | undefined}
                        onChange={(val) => setProposalField(field.id, val)}
                        onBlur={() => form.isDirty(field.id) && form.validateField(field.id)}
                    />
                ))}

                <Box>
                    <FormFieldLabel label="Principal Investigator" required inputId="piName" />
                    <Text size="xs" c="charcoal.7" mb="xs">
                        Select a Principal Investigator from your lab.
                    </Text>
                    <Box w="30%">
                        <Select
                            id="piName"
                            aria-label="Principal Investigator"
                            placeholder="Choose a PI"
                            searchable
                            data={members}
                            value={form.values.piUserId || null}
                            onChange={(id) => {
                                setProposalField('piUserId', id ?? '')
                                setProposalField('piName', members.find((m) => m.value === id)?.label ?? '')
                            }}
                            error={!!form.errors.piName}
                        />
                    </Box>
                </Box>

                <Box>
                    <FormFieldLabel label="Researcher" required inputId="researcher" />
                    <Text size="xs" c="charcoal.7" mb="xs">
                        Ensure that your profile is complete and updated.
                    </Text>
                    <Group align="center" gap="xxl">
                        <Box w="30%">
                            <TextInput id="researcher" aria-label="Researcher" value={researcherName} disabled />
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
    )
}
