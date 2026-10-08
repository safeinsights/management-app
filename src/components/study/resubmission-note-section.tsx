'use client'

import { FC } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { SingleUserEditor } from '@/components/editable-text/single-user-editor'
import {
    RESUBMISSION_NOTE_FIELD_ID,
    resubmissionNoteIsBlank,
    resubmissionNoteToLexicalJson,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { ResubmissionNoteCard, type ResubmissionNoteAutosaveStatus } from './resubmission-note-card'

interface ResubmissionNoteSectionProps {
    noteForm: UseFormReturnType<ResubmitNoteValue>
    orgName: string
    autosaveStatus?: ResubmissionNoteAutosaveStatus
}

// A blank note's error waits for the Resubmit click, per the card's blur rules (OTTER-778).
const validateUnlessBlank = (noteForm: UseFormReturnType<ResubmitNoteValue>) => {
    if (resubmissionNoteIsBlank(noteForm.getValues().resubmissionNote)) return
    noteForm.validateField(RESUBMISSION_NOTE_FIELD_ID)
}

// Single-user by design: the code note's draft is last-write-wins, not a shared doc (OTTER-558).
export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ noteForm, orgName, autosaveStatus }) => (
    <ResubmissionNoteCard noteForm={noteForm} orgName={orgName} autosaveStatus={autosaveStatus} showsSaveStatus>
        {(editorProps) => (
            <SingleUserEditor
                {...editorProps}
                id="code-resubmission-note"
                initialValue={resubmissionNoteToLexicalJson(noteForm.getInitialValues().resubmissionNote)}
                onBlur={() => validateUnlessBlank(noteForm)}
            />
        )}
    </ResubmissionNoteCard>
)
