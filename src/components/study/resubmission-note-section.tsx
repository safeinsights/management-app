'use client'

import { semanticColor } from '@/theme/tokens'
import { FC } from 'react'
import { Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { SaveStatusIndicator, type SaveStatusValue } from '@/components/save-status'
import { SingleUserEditor } from '@/components/editable-text/single-user-editor'
import { liveLimitError } from '@/lib/field-limits'
import {
    NOTE_MAX_ERROR,
    RESUBMISSION_NOTE_FIELD_ID,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    resubmissionNoteCharacterCount,
    resubmissionNoteIsBlank,
    resubmissionNoteIsOverLimit,
    resubmissionNoteToLexicalJson,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'

export interface ResubmissionNoteAutosaveStatus {
    isSaving: boolean
    lastSavedAt: Date | null
}

interface ResubmissionNoteSectionProps {
    noteForm: UseFormReturnType<ResubmitNoteValue>
    orgName: string
    autosaveStatus?: ResubmissionNoteAutosaveStatus
}

export function noteSaveStatus(status?: ResubmissionNoteAutosaveStatus): SaveStatusValue {
    if (status?.isSaving) return 'saving'
    if (status?.lastSavedAt) return 'saved'
    return 'idle'
}

export const RESUBMISSION_NOTE_EDITOR_MIN_HEIGHT = 140

export const resubmissionNoteContentStyle = {
    minHeight: RESUBMISSION_NOTE_EDITOR_MIN_HEIGHT,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

/** Shared by the code and proposal notes, whose editors report the same non-edits. */
export const resubmissionNoteChangeHandler = (noteForm: UseFormReturnType<ResubmitNoteValue>) => (json: string) => {
    // Focus alone makes Lexical report an update, and on an empty root it appends a paragraph.
    // Neither is an edit, and both would clear an error Resubmit has just raised (OTTER-762).
    const current = noteForm.getValues().resubmissionNote
    if (json === current) return
    if (resubmissionNoteIsBlank(json) && resubmissionNoteIsBlank(current)) return
    noteForm.setFieldValue(RESUBMISSION_NOTE_FIELD_ID, json)
}

// A blank note's error waits for the Resubmit click, per the card's blur rules (OTTER-778).
const validateUnlessBlank = (noteForm: UseFormReturnType<ResubmitNoteValue>) => {
    if (resubmissionNoteIsBlank(noteForm.getValues().resubmissionNote)) return
    noteForm.validateField(RESUBMISSION_NOTE_FIELD_ID)
}

// Single-user by design: the code note's draft is last-write-wins, not a shared doc (OTTER-558).
export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ noteForm, orgName, autosaveStatus }) => {
    const value = noteForm.values.resubmissionNote
    const error = liveLimitError(resubmissionNoteIsOverLimit(value), NOTE_MAX_ERROR, noteForm.errors.resubmissionNote)
    const characterCount = resubmissionNoteCharacterCount(value)

    // The error takes exactly the slot 'All changes saved' vacates, so the two can never co-exist (OTTER-674).
    const footerLeft = (
        <>
            <FieldErrorBox fieldId={RESUBMISSION_NOTE_FIELD_ID} error={error} isLive />
            <SaveStatusIndicator status={noteSaveStatus(autosaveStatus)} isVisible={!error} />
        </>
    )

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
                    <SingleUserEditor
                        id="code-resubmission-note"
                        inputId={RESUBMISSION_NOTE_FIELD_ID}
                        initialValue={resubmissionNoteToLexicalJson(noteForm.getInitialValues().resubmissionNote)}
                        contentStyle={resubmissionNoteContentStyle}
                        ariaLabel="Resubmission note"
                        onChange={resubmissionNoteChangeHandler(noteForm)}
                        onBlur={() => validateUnlessBlank(noteForm)}
                        error={error}
                        ariaRequired
                        ariaDescribedBy={fieldDescribedBy(RESUBMISSION_NOTE_FIELD_ID, {
                            hasError: !!error,
                            hasDescription: false,
                            hasCounter: true,
                        })}
                        footerLeft={footerLeft}
                        footerRight={
                            <CharacterCounter
                                id={fieldCounterId(RESUBMISSION_NOTE_FIELD_ID)}
                                count={characterCount}
                                maxCharacters={RESUBMIT_NOTE_MAX_CHARACTERS}
                            />
                        }
                        isResizable
                    />
                </Box>
            </Stack>
        </Paper>
    )
}
