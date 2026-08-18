'use client'

import { FC } from 'react'
import { useParams } from 'next/navigation'
import { Anchor, Box, Divider, Group, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import {
    SaveStatusAnnouncer,
    SaveStatusIndicator,
    announcedSaveStatus,
    type SaveStatusValue,
} from '@/components/save-status'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'
import { Routes, ExternalLinks } from '@/lib/routes'
import { type CollabFieldKey, type ProposalFormValues } from './schema'
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
    /**
     * The persisted `study.title`. Step 1 owns it now (OTTER-690), so this page reads it rather
     * than editing it, and passes it down for the reviewer preview.
     */
    studyTitle?: string | null
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

export const ProposalForm: FC<ProposalFormProps> = ({
    members = [],
    orgName = '',
    researcherName = '',
    researcherId = '',
    enclaveOrgSlug,
    studyTitle,
}) => {
    const { studyId, form, websocketProvider, yjsForm, tabSessionId } = useProposal()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const fieldsSaveStatus = useProviderSaveStatus(yjsForm.provider)

    // The Yjs provider saves the whole fields doc, so its status is form-wide;
    // each field only surfaces it after the user has actually edited that field
    // (OTTER-594 QA: pristine fields must not claim "All changes saved"), and stands down while
    // that field's validation error owns the row (OTTER-674).
    const saveStatusFor = (key: CollabFieldKey, error: unknown): SaveStatusValue =>
        yjsForm.editedKeys.has(key) && !error ? fieldsSaveStatus : 'idle'
    const datasetsSaveStatus = saveStatusFor('datasets', form.errors.datasets)
    const piSaveStatus = saveStatusFor('piName', form.errors.piName)

    // Both read the same provider, so a live region on each would have a screen reader read
    // "All changes saved" twice per save cycle. They stay visual and announce from here
    // once (OTTER-675). The collaborative text editors below own separate providers and so keep
    // their own regions.
    const fieldsAnnouncedStatus = announcedSaveStatus([datasetsSaveStatus, piSaveStatus])

    useSubmissionRedirectListener({
        provider: yjsForm.provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
    })

    return (
        <StudyKickOutProvider
            studyId={studyId}
            orgSlug={orgSlug}
            editableStatuses={PROPOSAL_EDITABLE_STATUSES}
            redirectTarget="studySubmitted"
        >
            <Stack gap="xxl">
                <SaveStatusAnnouncer status={fieldsAnnouncedStatus} />
                <Paper p="xxl">
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 2
                    </Text>
                    <Title fz={20} order={2} c="charcoal.9">
                        Study proposal
                    </Title>
                    <Divider my="md" />

                    <Text mb="xl">
                        Use this form to submit your study proposal. The information you share will help {orgName}{' '}
                        assess the feasibility, scientific value, and potential impact of your proposed research on
                        instructional practice. On review, they may approve or decline the request.
                    </Text>

                    <Stack gap="xxl">
                        {/* No Study title field: it moved to Step 1 with OTTER-690, which owns
                            study.title for drafts. */}
                        <FormField
                            inputId="datasets"
                            label="Dataset(s) of interest"
                            required
                            description="Select the dataset(s) you’d like to use for your research. You’ll find options based on the selected Data Partner in Step 1 and its data availability."
                            error={form.errors.datasets}
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
                            <SaveStatusIndicator status={datasetsSaveStatus} announce={false} />
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
                            error={form.errors.piName}
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
                            <SaveStatusIndicator status={piSaveStatus} announce={false} />
                        </FormField>

                        {/* FormField, not FormFieldLabel: the two render labels at different sizes
                            and weights, which showed as a mismatch against Principal Investigator
                            right above in this same panel (OTTER-647). */}
                        <FormField
                            inputId="researcher"
                            label="Researcher"
                            required
                            description="Ensure that your profile is complete and updated."
                        >
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
                        </FormField>
                    </Stack>
                </Paper>

                <ProposalFooter
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                    studyTitle={studyTitle}
                />
            </Stack>
        </StudyKickOutProvider>
    )
}
