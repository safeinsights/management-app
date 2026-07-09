'use client'

import { FC } from 'react'
import { useParams } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { EditInitialRequestSection, type MemberOption } from './edit-initial-request-section'
import { EditResubmitFooter } from './footer'

// Change-requested proposals are co-editable by the whole lab; once any member
// resubmits, the study leaves CHANGE-REQUESTED and the rest must be kicked out.
const RESUBMIT_EDITABLE_STATUSES = ['CHANGE-REQUESTED'] as const

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
    const { studyId, noteForm, isSavingNote, noteLastSavedAt, yjsForm, tabSessionId } = useEditResubmit()
    const { orgSlug } = useParams<{ orgSlug: string }>()

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
            editableStatuses={RESUBMIT_EDITABLE_STATUSES}
            redirectTarget="studySubmitted"
        >
            <Stack gap="xxl">
                <Title order={1}>Edit Initial Request</Title>

                <EditInitialRequestSection
                    orgName={orgName}
                    members={members}
                    researcherName={researcherName}
                    enclaveOrgSlug={enclaveOrgSlug}
                />

                <FeedbackAndNotesSection entries={feedbackEntries} />

                <ResubmissionNoteSection
                    noteForm={noteForm}
                    orgName={orgName}
                    autosaveStatus={{ isSaving: isSavingNote, lastSavedAt: noteLastSavedAt }}
                />

                <EditResubmitFooter
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </Stack>
        </StudyKickOutProvider>
    )
}
