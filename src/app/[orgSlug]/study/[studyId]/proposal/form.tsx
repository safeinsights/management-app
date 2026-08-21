'use client'

import { FC } from 'react'
import { useParams } from 'next/navigation'
import { Anchor, Box, Group, Paper, Select, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import {
    SaveStatusAnnouncer,
    SaveStatusIndicator,
    announcedSaveStatus,
    type SaveStatusValue,
} from '@/components/save-status'
import { useProviderSaveStatus } from '@/lib/realtime/use-provider-save-status'
import { ExternalLinks } from '@/lib/routes'
import { overCharacterLimitError, type CollabFieldKey, type ProposalFormValues } from './schema'
import { useProposal } from '@/contexts/proposal'
import { ProposalFooter } from './footer'
import { ResearcherField } from './researcher-field'
import { DATASETS_FIELD_ID, PI_SELECT_ID } from './field-ids'
import { editableTextFields, type EditableTextField } from './field-config'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countCharactersFromLexical } from '@/lib/lexical'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'

const PROPOSAL_EDITABLE_STATUSES = ['DRAFT', 'CHANGE-REQUESTED'] as const

const introText = (orgName: string) =>
    `Submit your proposal to ${orgName} for review. They will assess its feasibility, scientific value, and potential impact on instructional practice. After review, they may approve it, request revisions, or decline it.`

const datasetsDescription = (orgName: string) => `Select the datasets available through ${orgName} for this study.`

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
    /** Whether the viewer is the researcher who created this draft. Gates the Researcher row. */
    isDraftCreator?: boolean
}

const EditableTextFieldEntry: FC<{
    field: EditableTextField
    form: UseFormReturnType<ProposalFormValues>
    studyId: string
    websocketProvider: HocuspocusProviderWebsocket | null
}> = ({ field, form, studyId, websocketProvider }) => {
    const value = form.values[field.id] as string
    const error = form.errors[field.id] as string | undefined

    // Only the over-limit half of the rule is live. The required half belongs to blur and to the
    // Submit click: running it on change would flash "Enter your project summary before
    // continuing." the moment the user clears the box, which the card forbids. Mantine's
    // clearInputErrorOnChange has already dropped any previous message by the time this runs, so
    // the within-limit case needs no branch of its own.
    const onChange = (val: string) => {
        form.setFieldValue(field.id, val)
        if (countCharactersFromLexical(val) > field.maxCharacters) {
            form.setFieldError(field.id, overCharacterLimitError(field.label, field.maxCharacters))
        }
    }
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
            countMode="characters"
            contentHeight={field.contentHeight}
            isResizable
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
    isDraftCreator = false,
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

    const intro = introText(orgName)
    const datasetsHelp = datasetsDescription(orgName)

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
                {/* ProposalStepHeader supplies the card, the eyebrow, the heading and the 24px
                    divider, which is the "reuse the section header component" requirement. No
                    studyTitle: Step 1 owns the title now, and the card forbids repeating it as body
                    text here.
                    Literal 24 rather than gap="lg": this app's Mantine `lg` is 20px while the design
                    token is 24px. Once the theme scale is aligned these can switch to the token. */}
                <ProposalStepHeader stepLabel="STEP 2" heading="Study proposal">
                    <Stack gap={24}>
                        <Text>{intro}</Text>

                        {/* No Study title field: it moved to Step 1 with OTTER-690, which owns
                            study.title for drafts. */}
                        <FormField
                            inputId={DATASETS_FIELD_ID}
                            label="Dataset(s) of interest"
                            required
                            description={datasetsHelp}
                            error={form.errors.datasets}
                        >
                            <Group align="center" gap="xxl">
                                {/* 60% of the card's inner content width. The Paper's xxl padding is
                                    already excluded, so this is the "after padding" width the card
                                    asks for. */}
                                <Box w="60%">
                                    <DatasetMultiSelect
                                        id={DATASETS_FIELD_ID}
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
                                        // The card removes placeholder text from every input field
                                        // on this page. The resubmit page keeps its own.
                                        placeholder=""
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
                </ProposalStepHeader>

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
                            inputId={PI_SELECT_ID}
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
                                    id={PI_SELECT_ID}
                                    aria-label="Principal Investigator"
                                    // Placeholder-free for the same reason the dataset field is:
                                    // the card removes placeholder text from every input on this
                                    // page.
                                    placeholder=""
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

                        <ResearcherField
                            researcherName={researcherName}
                            orgName={orgName}
                            isDraftCreator={isDraftCreator}
                        />
                    </Stack>
                </Paper>

                <ProposalFooter
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                    studyTitle={studyTitle}
                    orgName={orgName}
                />
            </Stack>
        </StudyKickOutProvider>
    )
}
