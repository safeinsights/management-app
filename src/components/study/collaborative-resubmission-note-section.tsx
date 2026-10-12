'use client'

import { FC } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { Editor } from '@/components/editable-text/editor'
import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { proposalResubmissionNoteDocNameForVersion } from '@/lib/collaboration-documents'
import {
    RESUBMISSION_NOTE_FIELD_ID,
    resubmissionNoteToLexicalJson,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { ResubmissionNoteCard, type ResubmissionNoteAutosaveStatus } from './resubmission-note-card'

interface CollaborativeResubmissionNoteSectionProps {
    studyId: string
    /** Version the RESUBMISSION-NOTE comment will take on submit; scopes the Yjs doc to this round. */
    noteVersion: number
    noteForm: UseFormReturnType<ResubmitNoteValue>
    orgName: string
    /** Draft from `study.proposal_resubmission_note_draft`; seeds the single-user editor only. */
    initialNote: string
    websocketProvider: HocuspocusProviderWebsocket | null
    autosaveStatus: ResubmissionNoteAutosaveStatus
}

export const CollaborativeResubmissionNoteSection: FC<CollaborativeResubmissionNoteSectionProps> = ({
    studyId,
    noteVersion,
    noteForm,
    orgName,
    initialNote,
    websocketProvider,
    autosaveStatus,
}) => {
    const singleUserEditing = useSingleUserEditing()

    return (
        <ResubmissionNoteCard
            noteForm={noteForm}
            orgName={orgName}
            autosaveStatus={autosaveStatus}
            showsSaveStatus={singleUserEditing}
        >
            {(editorProps) => (
                <Editor
                    {...editorProps}
                    id={proposalResubmissionNoteDocNameForVersion(studyId, noteVersion)}
                    studyId={studyId}
                    initialValue={resubmissionNoteToLexicalJson(initialNote) || undefined}
                    websocketProvider={websocketProvider}
                    onBlur={() => noteForm.validateField(RESUBMISSION_NOTE_FIELD_ID)}
                />
            )}
        </ResubmissionNoteCard>
    )
}
