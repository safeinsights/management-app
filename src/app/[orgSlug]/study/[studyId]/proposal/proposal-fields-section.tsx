'use client'

import { FC } from 'react'
import { Anchor, Box, Group, Paper, Select, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { type HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { DatasetMultiSelect } from '@/components/dataset-multi-select'
import { SaveStatusAnnouncer, SaveStatusIndicator, announcedSaveStatus } from '@/components/save-status'
import { useCollabFieldsSaveStatus } from '@/hooks/use-collab-fields-save-status'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { ExternalLinks } from '@/lib/routes'
import { ResearcherField } from './researcher-field'
import { DATASETS_FIELD_ID, PI_SELECT_ID } from './field-ids'
import { editableTextFields } from './field-config'
import { ProposalTextFieldEntry } from './collaborative-proposal-text-field'
import { datasetsDescription, proposalIntroText } from './copy'
import { type ProposalFormValues } from './schema'

export interface MemberOption {
    value: string
    label: string
}

interface ProposalFieldsSectionProps {
    studyId: string
    form: UseFormReturnType<ProposalFormValues>
    yjsForm: ReturnType<typeof useYjsFormMap>
    websocketProvider: HocuspocusProviderWebsocket | null
    /** "Study proposal" on Step 2, "Edit proposal" on the revision page; the card is otherwise the same. */
    heading: string
    orgName: string
    members: MemberOption[]
    researcherName: string
    enclaveOrgSlug?: string
    /** Whether the viewer is the researcher who created the draft. Gates the Researcher row's guidance. */
    isDraftCreator?: boolean
}

// One card for Step 2 and Edit proposal (OTTER-691, OTTER-762). It takes the page's form and
// collaboration handles as props rather than reading either page's context, so the two cannot
// drift apart again.
export const ProposalFieldsSection: FC<ProposalFieldsSectionProps> = ({
    studyId,
    form,
    yjsForm,
    websocketProvider,
    heading,
    orgName,
    members,
    researcherName,
    enclaveOrgSlug,
    isDraftCreator = false,
}) => {
    // Datasets and PI write into the one proposal-fields Yjs doc, unlike the rich-text editors,
    // which each own a document and report their own status from inside the editor (OTTER-748).
    const saveStatusFor = useCollabFieldsSaveStatus(yjsForm)
    const datasetsSaveStatus = saveStatusFor('datasets', form.errors.datasets)
    const piSaveStatus = saveStatusFor('piName', form.errors.piName)

    // One provider behind both, so a live region on each would have a screen reader read
    // "All changes saved" twice per save cycle. They stay visual and announce from here
    // once (OTTER-675); the editors keep their own regions.
    const fieldsAnnouncedStatus = announcedSaveStatus([datasetsSaveStatus, piSaveStatus])

    const intro = proposalIntroText(orgName)
    const datasetsHelp = datasetsDescription(orgName)

    const handleDatasetsChange = (datasets: string[]) => {
        form.setFieldValue('datasets', datasets)
        yjsForm.pushField('datasets', datasets)
    }

    // Cannot spread getInputProps('piName'): the Select's value is the piUserId while piName holds
    // the label, so the two are set together.
    const handlePIChange = (id: string | null) => {
        const piUserId = id ?? ''
        const piName = members.find((member) => member.value === id)?.label ?? ''
        form.setFieldValue('piUserId', piUserId)
        form.setFieldValue('piName', piName)
        yjsForm.pushPI(piUserId, piName)
    }

    return (
        <Stack gap="xxl">
            <SaveStatusAnnouncer status={fieldsAnnouncedStatus} />
            {/* No study title anywhere in the card: Step 1 owns it (OTTER-690) and the card forbids
                repeating it as body text. Literal 24 rather than gap="lg": this app's Mantine `lg`
                is 20px while the design token is 24px. */}
            <ProposalStepHeader stepLabel="STEP 2" heading={heading}>
                <Stack gap={24}>
                    <Text>{intro}</Text>

                    <FormField
                        inputId={DATASETS_FIELD_ID}
                        label="Dataset(s) of interest"
                        required
                        description={datasetsHelp}
                        error={form.errors.datasets}
                    >
                        <Group align="center" gap="xxl">
                            {/* 60% of the card's inner content width; the Paper's padding is
                                already excluded. */}
                            <Box w="60%">
                                <DatasetMultiSelect
                                    id={DATASETS_FIELD_ID}
                                    value={form.values.datasets}
                                    onChange={handleDatasetsChange}
                                    onBlur={() => form.validateField('datasets')}
                                    error={form.errors.datasets}
                                    suppressOwnError
                                    required
                                    orgSlug={enclaveOrgSlug}
                                    // The card removes placeholder text from every input.
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
                <ProposalTextFieldEntry
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
                        description="Select the Principal Investigator for this study."
                        error={form.errors.piName}
                    >
                        <Box w="30%">
                            <Select
                                id={PI_SELECT_ID}
                                aria-label="Principal Investigator"
                                placeholder=""
                                searchable
                                data={members}
                                value={form.values.piUserId || null}
                                onChange={handlePIChange}
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
