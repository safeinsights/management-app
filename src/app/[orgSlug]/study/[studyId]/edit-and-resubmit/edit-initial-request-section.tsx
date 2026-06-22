'use client'

import { FC } from 'react'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { countWords } from '@/lib/lexical'
import { Routes, ExternalLinks } from '@/lib/routes'
import { WORD_LIMITS, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { editableTextFields, type EditableTextField } from '@/app/[orgSlug]/study/[studyId]/proposal/field-config'
import { CollaborativeProposalTextField } from '@/app/[orgSlug]/study/[studyId]/proposal/collaborative-proposal-text-field'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'

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

const EditableTextFieldEntry: FC<{
    field: EditableTextField
    form: UseFormReturnType<ProposalFormValues>
    studyId: string
    websocketProvider: HocuspocusProviderWebsocket | null
}> = ({ field, form, studyId, websocketProvider }) => {
    const value = form.values[field.id] as string
    const error = form.errors[field.id] as string | undefined
    const onChange = (val: string) => form.setFieldValue(field.id, val)

    return (
        <CollaborativeProposalTextField
            studyId={studyId}
            field={field as typeof field & { id: ProposalTextFieldKey }}
            initialValue={value}
            error={error}
            onChange={onChange}
            websocketProvider={websocketProvider}
        />
    )
}

export const EditInitialRequestSection: FC<EditInitialRequestSectionProps> = ({
    orgName,
    members,
    researcherName,
    enclaveOrgSlug,
}) => {
    const { studyId, form, yjsForm, websocketProvider } = useEditResubmit()
    const titleWordCount = countWords(form.values.title)
    const titleInputProps = form.getInputProps('title')

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
                        {...titleInputProps}
                        onChange={(event) => {
                            titleInputProps.onChange?.(event)
                            yjsForm.pushField('title', event.currentTarget.value)
                        }}
                        value={form.values.title ?? ''}
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
                        Select the dataset(s) you’d like to use for your research.
                    </Text>
                    <Group align="center" gap="xxl">
                        <Box w="50%">
                            <DatasetMultiSelect
                                id="datasets"
                                value={form.values.datasets}
                                onChange={(val) => {
                                    form.setFieldValue('datasets', val)
                                    yjsForm.pushField('datasets', val)
                                }}
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
                    <EditableTextFieldEntry
                        key={field.id}
                        field={field}
                        form={form}
                        studyId={studyId}
                        websocketProvider={websocketProvider}
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
                                const piUserId = id ?? ''
                                const piName = members.find((m) => m.value === id)?.label ?? ''
                                form.setFieldValue('piUserId', piUserId)
                                form.setFieldValue('piName', piName)
                                yjsForm.pushPI(piUserId, piName)
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
