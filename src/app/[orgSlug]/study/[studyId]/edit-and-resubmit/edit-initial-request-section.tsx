'use client'

import { FC } from 'react'
import { Anchor, Box, Group, Paper, Select, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { SaveStatusAnnouncer, SaveStatusIndicator, announcedSaveStatus } from '@/components/save-status'
import { useCollabFieldsSaveStatus } from '@/hooks/use-collab-fields-save-status'
import { ExternalLinks } from '@/lib/routes'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { editableTextFields } from '@/app/[orgSlug]/study/[studyId]/proposal/field-config'
import { DATASETS_FIELD_ID, PI_SELECT_ID } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { datasetsDescription, proposalIntroText } from '@/app/[orgSlug]/study/[studyId]/proposal/copy'
import { ProposalTextFieldEntry } from '@/app/[orgSlug]/study/[studyId]/proposal/collaborative-proposal-text-field'
import { ResearcherField } from '@/app/[orgSlug]/study/[studyId]/proposal/researcher-field'

export interface MemberOption {
    value: string
    label: string
}

interface EditInitialRequestSectionProps {
    orgName: string
    members: MemberOption[]
    researcherName: string
    enclaveOrgSlug?: string
    /** Whether the viewer is the researcher who created the study. Gates the Researcher row's guidance. */
    isDraftCreator?: boolean
}

export const EditInitialRequestSection: FC<EditInitialRequestSectionProps> = ({
    orgName,
    members,
    researcherName,
    enclaveOrgSlug,
    isDraftCreator = false,
}) => {
    const { studyId, form, yjsForm, websocketProvider } = useEditResubmit()

    // Both write into the one proposal-fields Yjs doc, unlike the rich-text editors below, which
    // each own a document and report their own status from inside the editor (OTTER-748).
    const saveStatusFor = useCollabFieldsSaveStatus(yjsForm)
    const datasetsSaveStatus = saveStatusFor('datasets', form.errors.datasets)
    const piSaveStatus = saveStatusFor('piName', form.errors.piName)

    // One provider behind both, so a live region on each would have a screen reader read
    // "All changes saved" twice per save cycle. They stay visual and announce from here
    // once (OTTER-675); the editors below keep their own regions.
    const fieldsAnnouncedStatus = announcedSaveStatus([datasetsSaveStatus, piSaveStatus])

    const intro = proposalIntroText(orgName)
    const datasetsHelp = datasetsDescription(orgName)

    return (
        <Stack gap="xxl" data-testid="edit-initial-request-section">
            <SaveStatusAnnouncer status={fieldsAnnouncedStatus} />
            {/* The same card as Step 2 (OTTER-691), re-titled for the revision round. No study
                title anywhere in it: Step 1 owns the title and the card forbids repeating it as
                body text (OTTER-762). */}
            <ProposalStepHeader stepLabel="STEP 2" heading="Edit proposal">
                <Stack gap={24}>
                    <Text>{intro}</Text>

                    {/* No Study title field: this page no longer edits study.title (OTTER-762). */}
                    <FormField
                        inputId={DATASETS_FIELD_ID}
                        label="Dataset(s) of interest"
                        required
                        description={datasetsHelp}
                        error={form.errors.datasets as string | undefined}
                    >
                        <Group align="center" gap="xxl">
                            <Box w="50%">
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
                <ProposalTextFieldEntry
                    key={field.id}
                    field={field}
                    form={form}
                    studyId={studyId}
                    websocketProvider={websocketProvider}
                    placeholder={field.placeholder}
                    liveCharacterLimit
                />
            ))}

            <Paper p="xxl">
                <Stack gap="xxl">
                    <FormField
                        inputId={PI_SELECT_ID}
                        label="Principal Investigator"
                        required
                        description="Select the Principal Investigator for this study."
                        error={form.errors.piName as string | undefined}
                    >
                        <Box w="30%">
                            {/* Cannot spread getInputProps('piName'): this Select's value is the
                                piUserId while piName holds the label. */}
                            <Select
                                id={PI_SELECT_ID}
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

                    <ResearcherField
                        researcherName={researcherName}
                        orgName={orgName}
                        isDraftCreator={isDraftCreator}
                    />
                </Stack>
            </Paper>
        </Stack>
    )
}
