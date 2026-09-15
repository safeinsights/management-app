'use client'

import { FC } from 'react'
import { Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { SaveStatusIndicator } from '@/components/save-status'
import { Editor } from '@/components/editable-text/editor'
import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { proposalResubmissionNoteDocNameForVersion } from '@/lib/collaboration-documents'
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
import { noteSaveStatus, type ResubmissionNoteAutosaveStatus } from './resubmission-note-section'

const EDITOR_MIN_HEIGHT = 140

const contentStyle = {
    minHeight: EDITOR_MIN_HEIGHT,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

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

// Collaborative mode has the editor's own provider-driven indicator, so this one would double up.
// The error case goes through `isVisible` rather than unmounting: a live region only announces
// content changes, so remounting one already holding "All changes saved" says nothing (OTTER-675).
const SingleUserSaveStatus: FC<{
    isVisible: boolean
    hasError: boolean
    autosaveStatus: ResubmissionNoteAutosaveStatus
}> = ({ isVisible, hasError, autosaveStatus }) => {
    if (!isVisible) return null
    return <SaveStatusIndicator status={noteSaveStatus(autosaveStatus)} isVisible={!hasError} />
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
    const value = noteForm.values.resubmissionNote
    const error = noteForm.errors.resubmissionNote as string | undefined
    const characterCount = resubmissionNoteCharacterCount(value)
    const editorInitialValue = resubmissionNoteToLexicalJson(initialNote) || undefined

    // Only the over-limit half of the rule is live; the required half belongs to blur and Resubmit,
    // so clearing the box does not flash an error mid-edit (OTTER-762).
    const onNoteChange = (json: string) => {
        // Focusing an empty Lexical root appends a paragraph, which arrives here as a change. It
        // is not an edit, and letting it through would clear the required error Resubmit has just
        // raised on the field it then focuses.
        if (resubmissionNoteIsBlank(json) && resubmissionNoteIsBlank(value)) return
        noteForm.setFieldValue(RESUBMISSION_NOTE_FIELD_ID, json)
        if (resubmissionNoteIsOverLimit(json)) noteForm.setFieldError(RESUBMISSION_NOTE_FIELD_ID, NOTE_MAX_ERROR)
    }

    // The error takes exactly the slot 'All changes saved' vacates, so the two can never co-exist (OTTER-674).
    const footerLeft = (
        <>
            <FieldErrorBox fieldId={RESUBMISSION_NOTE_FIELD_ID} error={error} isLive />
            <SingleUserSaveStatus isVisible={singleUserEditing} hasError={!!error} autosaveStatus={autosaveStatus} />
        </>
    )

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Title order={3} size="h4" c="charcoal.9">
                        Resubmission note
                        <RequiredIndicator isVisible />
                    </Title>
                    <Divider my="md" />
                    <Text size="sm" c="charcoal.7" mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    {/* No placeholder: the card removes the input's placeholder text (OTTER-762). */}
                    <Editor
                        id={proposalResubmissionNoteDocNameForVersion(studyId, noteVersion)}
                        inputId={RESUBMISSION_NOTE_FIELD_ID}
                        studyId={studyId}
                        initialValue={editorInitialValue}
                        websocketProvider={websocketProvider}
                        contentStyle={contentStyle}
                        ariaLabel="Resubmission note"
                        onChange={onNoteChange}
                        onBlur={() => noteForm.validateField(RESUBMISSION_NOTE_FIELD_ID)}
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
                        skeletonHeight={EDITOR_MIN_HEIGHT}
                    />
                </Box>
            </Stack>
        </Paper>
    )
}
