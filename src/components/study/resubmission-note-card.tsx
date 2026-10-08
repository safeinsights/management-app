'use client'

import { semanticColor } from '@/theme/tokens'
import { FC, type ReactNode } from 'react'
import { Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { SaveStatusIndicator, type SaveStatusValue } from '@/components/save-status'
import type { SingleUserEditorProps } from '@/components/editable-text/single-user-editor'
import { liveLimitError } from '@/lib/field-limits'
import {
    NOTE_MAX_ERROR,
    RESUBMISSION_NOTE_FIELD_ID,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    resubmissionNoteCharacterCount,
    resubmissionNoteIsBlank,
    resubmissionNoteIsOverLimit,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'

export interface ResubmissionNoteAutosaveStatus {
    isSaving: boolean
    lastSavedAt: Date | null
}

export function noteSaveStatus(status?: ResubmissionNoteAutosaveStatus): SaveStatusValue {
    if (status?.isSaving) return 'saving'
    if (status?.lastSavedAt) return 'saved'
    return 'idle'
}

/** What the card hands its editor; the caller adds the editor-specific props, `onBlur` included. */
export type ResubmissionNoteEditorProps = Pick<
    SingleUserEditorProps,
    | 'inputId'
    | 'contentStyle'
    | 'ariaLabel'
    | 'onChange'
    | 'error'
    | 'ariaRequired'
    | 'ariaDescribedBy'
    | 'footerLeft'
    | 'footerRight'
    | 'isResizable'
>

const contentStyle = {
    minHeight: 140,
    padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-md)',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

const noteChangeHandler = (noteForm: UseFormReturnType<ResubmitNoteValue>) => (json: string) => {
    // Focus alone makes Lexical report an update, and on an empty root it appends a paragraph.
    // Neither is an edit, and both would clear an error Resubmit has just raised (OTTER-762).
    const current = noteForm.getValues().resubmissionNote
    if (json === current) return
    if (resubmissionNoteIsBlank(json) && resubmissionNoteIsBlank(current)) return
    noteForm.setFieldValue(RESUBMISSION_NOTE_FIELD_ID, json)
}

// The error case goes through `isVisible` rather than unmounting: a live region only announces
// content changes, so remounting one already holding "All changes saved" says nothing (OTTER-675).
const SaveStatus: FC<{
    isVisible: boolean
    hasError: boolean
    autosaveStatus?: ResubmissionNoteAutosaveStatus
}> = ({ isVisible, hasError, autosaveStatus }) => {
    if (!isVisible) return null
    return <SaveStatusIndicator status={noteSaveStatus(autosaveStatus)} isVisible={!hasError} />
}

interface ResubmissionNoteCardProps {
    noteForm: UseFormReturnType<ResubmitNoteValue>
    orgName: string
    autosaveStatus?: ResubmissionNoteAutosaveStatus
    /** False in collaborative mode, where the editor's own indicator would double up. */
    showsSaveStatus: boolean
    children: (editorProps: ResubmissionNoteEditorProps) => ReactNode
}

export const ResubmissionNoteCard: FC<ResubmissionNoteCardProps> = ({
    noteForm,
    orgName,
    autosaveStatus,
    showsSaveStatus,
    children,
}) => {
    const value = noteForm.values.resubmissionNote
    const error = liveLimitError(resubmissionNoteIsOverLimit(value), NOTE_MAX_ERROR, noteForm.errors.resubmissionNote)

    // The error takes exactly the slot 'All changes saved' vacates, so the two can never co-exist (OTTER-674).
    const footerLeft = (
        <>
            <FieldErrorBox fieldId={RESUBMISSION_NOTE_FIELD_ID} error={error} isLive />
            <SaveStatus isVisible={showsSaveStatus} hasError={!!error} autosaveStatus={autosaveStatus} />
        </>
    )

    const editorProps: ResubmissionNoteEditorProps = {
        inputId: RESUBMISSION_NOTE_FIELD_ID,
        contentStyle,
        ariaLabel: 'Resubmission note',
        onChange: noteChangeHandler(noteForm),
        error,
        ariaRequired: true,
        ariaDescribedBy: fieldDescribedBy(RESUBMISSION_NOTE_FIELD_ID, {
            hasError: !!error,
            hasDescription: false,
            hasCounter: true,
        }),
        footerLeft,
        footerRight: (
            <CharacterCounter
                id={fieldCounterId(RESUBMISSION_NOTE_FIELD_ID)}
                count={resubmissionNoteCharacterCount(value)}
                maxCharacters={RESUBMIT_NOTE_MAX_CHARACTERS}
            />
        ),
        isResizable: true,
    }

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Title order={3} size="h4" c={semanticColor('text.primary')}>
                        Resubmission note
                        <RequiredIndicator isVisible />
                    </Title>
                    <Divider my="md" />
                    <Text size="sm" c={semanticColor('text.secondary')} mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    {/* No placeholder: the card removes the input's placeholder text (OTTER-762). */}
                    {children(editorProps)}
                </Box>
            </Stack>
        </Paper>
    )
}
