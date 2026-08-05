'use client'

import { FC } from 'react'
import { Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { RequiredIndicator } from '@/components/required-indicator'
import { InputError } from '@/components/errors'
import { fieldDescribedBy, fieldErrorId } from '@/components/form-field'
import { WordCounter } from '@/components/word-counter'
import { SaveStatusIndicator } from '@/components/save-status'
import { Editor } from '@/components/editable-text/editor'
import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { proposalResubmissionNoteDocNameForVersion } from '@/lib/collaboration-documents'
import {
    RESUBMIT_NOTE_MAX_WORDS,
    resubmissionNoteToLexicalJson,
    resubmissionNoteWordCount,
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

const PLACEHOLDER_TEXT =
    'Ex. Summarize the modifications made to your initial request, including specific sections revised, issues identified by the reviewer that have been addressed, and the rationale behind your resubmission.'

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

// In collaborative mode the editor renders its own provider-driven indicator;
// showing this one too would double up.
const SingleUserSaveStatus: FC<{ isVisible: boolean; autosaveStatus: ResubmissionNoteAutosaveStatus }> = ({
    isVisible,
    autosaveStatus,
}) => {
    if (!isVisible) return null
    return <SaveStatusIndicator status={noteSaveStatus(autosaveStatus)} />
}

// Carries the id `aria-describedby` points at; null when clean so the save indicator keeps the row's left edge.
const NoteFieldError: FC<{ error?: string }> = ({ error }) => {
    if (!error) return null
    return (
        <Box id={fieldErrorId('resubmissionNote')}>
            <InputError error={error} />
        </Box>
    )
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
    const wordCount = resubmissionNoteWordCount(value)
    const editorInitialValue = resubmissionNoteToLexicalJson(initialNote) || undefined

    const onNoteChange = (json: string) => noteForm.setFieldValue('resubmissionNote', json)

    // The error takes exactly the slot 'All changes saved' vacates, so the two can never co-exist (OTTER-674).
    const footerLeft = (
        <>
            <NoteFieldError error={error} />
            <SingleUserSaveStatus isVisible={singleUserEditing && !error} autosaveStatus={autosaveStatus} />
        </>
    )

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Title order={4} c="charcoal.9">
                        Resubmission Note
                        <RequiredIndicator isVisible />
                    </Title>
                    <Divider my="md" />
                    <Text size="sm" c="charcoal.7" mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    <Editor
                        id={proposalResubmissionNoteDocNameForVersion(studyId, noteVersion)}
                        inputId="resubmissionNote"
                        studyId={studyId}
                        initialValue={editorInitialValue}
                        websocketProvider={websocketProvider}
                        contentStyle={contentStyle}
                        placeholder={PLACEHOLDER_TEXT}
                        ariaLabel="Resubmission Note"
                        onChange={onNoteChange}
                        onBlur={() => noteForm.validateField('resubmissionNote')}
                        error={error}
                        ariaRequired
                        ariaDescribedBy={fieldDescribedBy('resubmissionNote', {
                            hasError: !!error,
                            hasDescription: false,
                        })}
                        footerLeft={footerLeft}
                        footerRight={<WordCounter wordCount={wordCount} maxWords={RESUBMIT_NOTE_MAX_WORDS} />}
                        skeletonHeight={EDITOR_MIN_HEIGHT}
                    />
                </Box>
            </Stack>
        </Paper>
    )
}
