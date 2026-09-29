'use client'

import { FC, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { Stack } from '@mantine/core'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { CollaborativeResubmissionNoteSection } from '@/components/study/collaborative-resubmission-note-section'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import {
    ProposalFieldsSection,
    type MemberOption,
} from '@/app/[orgSlug]/study/[studyId]/proposal/proposal-fields-section'
import { EditResubmitFooter } from './footer'

// Co-editable by the whole lab; once any member resubmits the study leaves CHANGE-REQUESTED and
// the rest must be kicked out.
const RESUBMIT_EDITABLE_STATUSES = ['CHANGE-REQUESTED'] as const

interface EditResubmitFormProps {
    header: ReactNode
    orgName: string
    members: MemberOption[]
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    feedbackEntries: ProposalFeedbackEntry[]
    noteVersion: number
    initialNote: string
    /** The persisted `study.title`; read for the reviewer preview, never edited here (OTTER-762). */
    studyTitle?: string | null
    /** Whether the viewer is the researcher who created the study. Gates the Researcher row. */
    isDraftCreator?: boolean
}

export const EditResubmitForm: FC<EditResubmitFormProps> = ({
    header,
    orgName,
    members,
    researcherName,
    researcherId,
    enclaveOrgSlug,
    feedbackEntries,
    noteVersion,
    initialNote,
    studyTitle,
    isDraftCreator = false,
}) => {
    const { studyId, form, noteForm, isSavingNote, noteLastSavedAt, websocketProvider, yjsForm, tabSessionId } =
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
            <Stack gap="xxl">
                {header}

                <ProposalFieldsSection
                    studyId={studyId}
                    form={form}
                    yjsForm={yjsForm}
                    websocketProvider={websocketProvider}
                    heading="Edit proposal"
                    orgName={orgName}
                    members={members}
                    researcherName={researcherName}
                    isDraftCreator={isDraftCreator}
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
                    orgName={orgName}
                    studyTitle={studyTitle}
                />
            </Stack>
        </StudyKickOutProvider>
    )
}
