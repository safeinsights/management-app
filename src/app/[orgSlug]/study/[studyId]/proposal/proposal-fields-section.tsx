'use client'

import { FC } from 'react'
import { Box, Paper, Select, Stack, Text } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { type HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { FormField, nativeFieldProps } from '@/components/form-field'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { SaveStatusAnnouncer, SaveStatusIndicator, announcedSaveStatus } from '@/components/save-status'
import { useCollabFieldsSaveStatus } from '@/hooks/use-collab-fields-save-status'
import { type useYjsFormMap } from '@/hooks/use-yjs-form-map'
import { ResearcherField } from './researcher-field'
import { PI_SELECT_ID } from './field-ids'
import { editableTextFields } from './field-config'
import { ProposalTextFieldEntry } from './collaborative-proposal-text-field'
import { proposalIntroText } from './copy'
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
    isDraftCreator = false,
}) => {
    // PI writes into the proposal-fields Yjs doc, unlike the rich-text editors, which each own a
    // document and report their own status from inside the editor (OTTER-748).
    const saveStatusFor = useCollabFieldsSaveStatus(yjsForm)
    const piSaveStatus = saveStatusFor('piName', form.errors.piName)

    // The indicator stays visual and announces from here (OTTER-675); the editors keep their own
    // regions.
    const fieldsAnnouncedStatus = announcedSaveStatus([piSaveStatus])

    const intro = proposalIntroText(orgName)

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
            {/* No study title or datasets anywhere in the card: Step 1 owns both (OTTER-690,
                OTTER-803) and the card forbids repeating the title as body text. */}
            <ProposalStepHeader stepLabel="STEP 2" heading={heading}>
                <Text>{intro}</Text>
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
