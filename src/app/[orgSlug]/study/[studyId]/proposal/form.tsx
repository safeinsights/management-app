'use client'

import { FC, useState } from 'react'
import { useParams } from 'next/navigation'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { EditableText } from '@/components/editable-text'
import ProxyProvider from '@/components/proxy-provider'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { countWords } from '@/lib/word-count'
import { Routes, ExternalLinks } from '@/lib/routes'
import { DEFAULT_DRAFT_TITLE, WORD_LIMITS, type ProposalFormValues } from './schema'
import { useProposal } from '@/contexts/proposal'
import { ProposalFooter } from './footer'
import { editableTextFields, type EditableTextField } from './field-config'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'

const PROPOSAL_EDITABLE_STATUSES = ['DRAFT', 'CHANGE-REQUESTED'] as const

export interface MemberOption {
    value: string
    label: string
}

interface ProposalFormProps {
    members?: MemberOption[]
    orgName?: string
    researcherName?: string
    researcherId?: string
    enclaveOrgSlug?: string
}

const EditableTextFieldEntry: FC<{
    field: EditableTextField
    form: UseFormReturnType<ProposalFormValues>
    studyId: string
    websocketProvider: HocuspocusProviderWebsocket | null
    isCollaborationEnabled: boolean
}> = ({ field, form, studyId, websocketProvider, isCollaborationEnabled }) => {
    const value = form.values[field.id] as string
    const error = form.errors[field.id] as string | undefined
    const onChange = (val: string) => form.setFieldValue(field.id, val)

    if (isCollaborationEnabled) {
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

    return (
        <ProposalTextField
            field={field}
            value={value}
            error={error}
            onChange={onChange}
            onBlur={() => form.isDirty(field.id) && form.validateField(field.id)}
        />
    )
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
        <Paper p="xxl">
            <Stack gap="xxl">
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
            </Stack>
        </Paper>
    )
}

export const ProposalForm: FC<ProposalFormProps> = ({
    members = [],
    orgName = '',
    researcherName = '',
    researcherId = '',
    enclaveOrgSlug,
}) => {
    const { studyId, form, saveDraft, isSaving, isCollaborationEnabled, websocketProvider, yjsForm, tabSessionId } =
        useProposal()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const titleWordCount = countWords(form.values.title)
    const titleInputProps = form.getInputProps('title')

    useSubmissionRedirectListener({
        provider: yjsForm.provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
        enabled: isCollaborationEnabled,
    })

    return (
        <StudyKickOutProvider
            studyId={studyId}
            orgSlug={orgSlug}
            editableStatuses={PROPOSAL_EDITABLE_STATUSES}
            redirectTarget="studySubmitted"
            enabled={isCollaborationEnabled}
        >
            <ProxyProvider isDirty={form.isDirty()} onSaveDraft={saveDraft} isSavingDraft={isSaving}>
                <Stack gap="xxl">
                    <Paper p="xxl">
                        <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                            STEP 2
                        </Text>
                        <Title fz={20} order={4} c="charcoal.9">
                            Study proposal
                        </Title>
                        <Divider my="md" />

                        <Text mb="xl">
                            Use this form to submit your study proposal. The information you share will help {orgName}{' '}
                            assess the feasibility, scientific value, and potential impact of your proposed research on
                            instructional practice. On review, they may approve or decline the request.
                        </Text>

                        <Stack gap="xxl">
                            <Box>
                                <FormFieldLabel label="Study title" required inputId="title" />
                                <Text size="xs" c="charcoal.7" mb="xs">
                                    Give your study a short, clear title. This will help identify and reference your
                                    project on SafeInsights.
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
                                    value={form.values.title === DEFAULT_DRAFT_TITLE ? '' : form.values.title}
                                    error={!!form.errors.title}
                                />
                                <Group justify={form.errors.title ? 'space-between' : 'flex-end'} mt={4}>
                                    {form.errors.title && <InputError error={form.errors.title} />}
                                    <WordCounter wordCount={titleWordCount} maxWords={WORD_LIMITS.title} />
                                </Group>
                            </Box>

                            <Box>
                                <FormFieldLabel label="Dataset(s) of interest" required inputId="datasets" />
                                <Text size="xs" mb="xs" c="charcoal.7">
                                    Select the dataset(s) you&apos;d like to use for your research. You&apos;ll find
                                    options based on the selected Data Organization in Step 1 and its data availability.
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
                                <InputError error={form.errors.datasets} />
                            </Box>
                        </Stack>
                    </Paper>

                    {editableTextFields.map((field) => (
                        <EditableTextFieldEntry
                            key={field.id}
                            field={field}
                            form={form}
                            studyId={studyId}
                            websocketProvider={websocketProvider}
                            isCollaborationEnabled={isCollaborationEnabled}
                        />
                    ))}

                    <Paper p="xxl">
                        <Stack gap="xxl">
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

                    <ProposalFooter
                        researcherName={researcherName}
                        researcherId={researcherId}
                        piUserId={form.values.piUserId}
                        enclaveOrgSlug={enclaveOrgSlug}
                    />
                </Stack>
            </ProxyProvider>
        </StudyKickOutProvider>
    )
}
