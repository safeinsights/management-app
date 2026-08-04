'use client'

import { FC } from 'react'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'
import { FormField, nativeFieldProps } from '@/components/form-field'
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
    const onBlur = () => form.validateField(field.id)

    return (
        <CollaborativeProposalTextField
            studyId={studyId}
            field={field as typeof field & { id: ProposalTextFieldKey }}
            initialValue={value}
            error={error}
            onChange={onChange}
            onBlur={onBlur}
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
        <Stack gap="xxl" data-testid="edit-initial-request-section">
            <Paper p="xxl">
                <Stack gap="xxl">
                    <Box>
                        <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                            STEP 2
                        </Text>
                        <Title fz={20} order={4} c="charcoal.9">
                            Edit proposal
                        </Title>
                        <Divider my="md" />
                        <Text>
                            Use this form to submit your proposal. The information you share will help {orgName} assess
                            the feasibility, scientific value, and potential impact of your proposed research on
                            instructional practice. On review, they may approve or decline the request.
                        </Text>
                    </Box>

                    <FormField
                        inputId="title"
                        label="Study title"
                        required
                        description="Give your study a short, clear title. This will help identify and reference your project on SafeInsights."
                        error={form.errors.title}
                        footer={<WordCounter wordCount={titleWordCount} maxWords={WORD_LIMITS.title} />}
                    >
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
                            {...nativeFieldProps(form.errors.title, { required: true, description: true })}
                        />
                    </FormField>

                    <FormField
                        inputId="datasets"
                        label="Dataset(s) of interest"
                        required
                        description="Select the dataset(s) you’d like to use for your research. You’ll find options based on the selected Data Partner in Step 1 and its data availability."
                        error={form.errors.datasets as string | undefined}
                    >
                        <Group align="center" gap="xxl">
                            <Box w="50%">
                                <DatasetMultiSelect
                                    id="datasets"
                                    value={form.values.datasets}
                                    onChange={(val) => {
                                        form.setFieldValue('datasets', val)
                                        yjsForm.pushField('datasets', val)
                                    }}
                                    onBlur={() => form.validateField('datasets')}
                                    error={form.errors.datasets}
                                    suppressOwnError
                                    required
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
                    </FormField>
                </Stack>
            </Paper>

            {editableTextFields.map((field) => (
                <EditableTextFieldEntry
                    key={field.id}
                    field={field}
                    form={form}
                    studyId={studyId}
                    websocketProvider={websocketProvider}
                />
            ))}

            <Paper p="xxl">
                <Stack gap="xxl">
                    <FormField
                        inputId="piName"
                        label="Principal Investigator"
                        required
                        description="Select a Principal Investigator from your lab."
                        error={form.errors.piName as string | undefined}
                    >
                        <Box w="30%">
                            {/* Cannot spread getInputProps('piName'): this Select's value is the
                                piUserId while piName holds the label, so the composite handler
                                stays and blur validation is wired explicitly. */}
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
                                onBlur={() => form.validateField('piName')}
                                {...nativeFieldProps(form.errors.piName, { required: true, description: true })}
                            />
                        </Box>
                    </FormField>

                    {/* FormField, not FormFieldLabel: the two render labels at different sizes and
                        weights, which showed as a mismatch against Principal Investigator right
                        above in this same panel (OTTER-647). */}
                    <FormField
                        inputId="researcher"
                        label="Researcher"
                        required
                        description="Ensure that your profile is complete and updated."
                    >
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
                    </FormField>
                </Stack>
            </Paper>
        </Stack>
    )
}
