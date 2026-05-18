'use client'

import { FC, useEffect } from 'react'
import { Stack, Title } from '@mantine/core'
import ProxyProvider from '@/components/proxy-provider'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { EditInitialRequestSection, type MemberOption } from './edit-initial-request-section'
import { ResubmissionNoteSection } from './resubmission-note-section'
import { EditResubmitFooter } from './footer'

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
    const { form, noteForm, saveDraft, isSaving } = useEditResubmit()

    // Validate the resubmission note on mount so the Resubmit button is
    // disabled out of the gate (initial value is empty / under the word
    // minimum); Mantine doesn't auto-validate initial values otherwise.
    useEffect(() => {
        noteForm.validateField('resubmissionNote')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <ProxyProvider isDirty={form.isDirty()} onSaveDraft={saveDraft} isSavingDraft={isSaving}>
            <Stack gap="xxl">
                <Title order={1}>Edit Initial Request</Title>

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
