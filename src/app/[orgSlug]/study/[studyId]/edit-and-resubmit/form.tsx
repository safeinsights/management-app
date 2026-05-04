'use client'

import { FC } from 'react'
import { Group, Stack, Title } from '@mantine/core'
import ProxyProvider from '@/components/proxy-provider'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import type { ProposalFeedbackEntry } from './types'
import { EditInitialRequestSection, type MemberOption } from './edit-initial-request-section'
import { FeedbackAndNotesSection } from './feedback-and-notes-section'
import { ResubmissionNoteSection } from './resubmission-note-section'
import { EditResubmitFooter } from './footer'
import { AutoSaveIndicator } from './auto-save-indicator'
import { useAutoSave } from './use-auto-save'

interface EditResubmitFormProps {
    orgName: string
    members: MemberOption[]
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    feedbackEntries: ProposalFeedbackEntry[]
}

export const EditResubmitForm: FC<EditResubmitFormProps> = ({
    orgName,
    members,
    researcherName,
    researcherId,
    enclaveOrgSlug,
    feedbackEntries,
}) => {
    const { form, saveDraft, isSaving, lastSavedAt } = useEditResubmit()

    const isProposalDirty = form.isDirty()
    useAutoSave({ isDirty: isProposalDirty, isSaving, saveDraft })

    return (
        <ProxyProvider isDirty={isProposalDirty} onSaveDraft={saveDraft} isSavingDraft={isSaving}>
            <Stack gap="xxl">
                <Group justify="space-between" align="center">
                    <Title order={1}>Edit Initial Request</Title>
                    <AutoSaveIndicator isSaving={isSaving} lastSavedAt={lastSavedAt} />
                </Group>

                <EditInitialRequestSection
                    orgName={orgName}
                    members={members}
                    researcherName={researcherName}
                    enclaveOrgSlug={enclaveOrgSlug}
                />

                <FeedbackAndNotesSection entries={feedbackEntries} />

                <ResubmissionNoteSection orgName={orgName} />

                <EditResubmitFooter
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </Stack>
        </ProxyProvider>
    )
}
