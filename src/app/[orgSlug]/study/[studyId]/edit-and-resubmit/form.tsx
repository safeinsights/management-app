'use client'

import { FC } from 'react'
import { useParams } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { CollaborativeResubmissionNoteSection } from '@/components/study/collaborative-resubmission-note-section'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { ProposalRevisionProvider } from '@/hooks/use-start-proposal-revision'
import { EditInitialRequestSection, type MemberOption } from './edit-initial-request-section'
import { EditResubmitFooter } from './footer'

// Change-requested proposals are co-editable by the whole lab; once any member
// resubmits, the study leaves this editing flow (→ PENDING-REVIEW) and the rest
// must be kicked out. OTTER-636: the first edit flips CHANGE-REQUESTED → a revision
// DRAFT, so DRAFT is editable here too. The page guard guarantees any DRAFT reaching
// this form is a revision draft (a fresh draft is served by /proposal, never here).
const RESUBMIT_EDITABLE_STATUSES = ['CHANGE-REQUESTED', 'DRAFT'] as const

interface EditResubmitFormProps {
    orgName: string
    members: MemberOption[]
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    feedbackEntries: ProposalFeedbackEntry[]
    /** Version the RESUBMISSION-NOTE comment will take on submit; scopes the note's Yjs doc to this round. */
    noteVersion: number
    /** Persisted note draft; seeds the single-user editor. */
    initialNote: string
    /**
     * Server status at page load. CHANGE-REQUESTED means the first edit still needs to flip the study
     * to a revision DRAFT; a revision DRAFT is already flipped (a page reload after the first edit).
     */
    initialStatus: 'CHANGE-REQUESTED' | 'DRAFT'
}

export const EditResubmitForm: FC<EditResubmitFormProps> = ({
    orgName,
    members,
    researcherName,
    researcherId,
    enclaveOrgSlug,
    feedbackEntries,
    noteVersion,
    initialNote,
    initialStatus,
}) => {
    const { studyId, noteForm, isSavingNote, noteLastSavedAt, websocketProvider, yjsForm, tabSessionId } =
        useEditResubmit()
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
            <ProposalRevisionProvider
                studyId={studyId}
                orgSlug={orgSlug}
                enabled={initialStatus === 'CHANGE-REQUESTED'}
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

                    <CollaborativeResubmissionNoteSection
                        studyId={studyId}
                        noteVersion={noteVersion}
                        noteForm={noteForm}
                        orgName={orgName}
                        initialNote={initialNote}
                        websocketProvider={websocketProvider}
                        autosaveStatus={{ isSaving: isSavingNote, lastSavedAt: noteLastSavedAt }}
                    />

                    <EditResubmitFooter
                        researcherName={researcherName}
                        researcherId={researcherId}
                        enclaveOrgSlug={enclaveOrgSlug}
                    />
                </Stack>
            </ProposalRevisionProvider>
        </StudyKickOutProvider>
    )
}
