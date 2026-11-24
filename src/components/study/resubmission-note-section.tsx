'use client'

import { FC } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { SingleUserEditor } from '@/components/editable-text/single-user-editor'
import { resubmissionNoteToLexicalJson, type ResubmitNoteValue } from '@/schema/resubmission-note'
import {
    ResubmissionNoteCard,
    validateNoteUnlessBlank,
    type ResubmissionNoteAutosaveStatus,
} from './resubmission-note-card'

interface ResubmissionNoteSectionProps {
    noteForm: UseFormReturnType<ResubmitNoteValue>
    orgName: string
    autosaveStatus?: ResubmissionNoteAutosaveStatus
}

// Single-user by design: the code note's draft is last-write-wins, not a shared doc (OTTER-558).
export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ noteForm, orgName, autosaveStatus }) => (
    <ResubmissionNoteCard noteForm={noteForm} orgName={orgName} autosaveStatus={autosaveStatus} showsSaveStatus>
        {(editorProps) => (
            <SingleUserEditor
                {...editorProps}
                id="code-resubmission-note"
                initialValue={resubmissionNoteToLexicalJson(noteForm.getInitialValues().resubmissionNote)}
                onBlur={() => validateNoteUnlessBlank(noteForm)}
            />
        )}
    </ResubmissionNoteCard>
)
