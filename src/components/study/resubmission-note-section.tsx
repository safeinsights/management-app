'use client'

import { FC } from 'react'
import { Box, Divider, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import { RequiredIndicator } from '@/components/required-indicator'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox, nativeFieldProps } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { SaveStatusIndicator, type SaveStatusValue } from '@/components/save-status'
import {
    RESUBMIT_NOTE_MAX_CHARACTERS,
    resubmissionNoteCharacterCount,
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

export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ noteForm, orgName, autosaveStatus }) => {
    const value = noteForm.values.resubmissionNote
    const error = noteForm.errors.resubmissionNote as string | undefined
    const characterCount = resubmissionNoteCharacterCount(value)
    const saveStatus = noteSaveStatus(autosaveStatus)

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Title order={3} size="h4" c="charcoal.9">
                        Resubmission Note
                        <RequiredIndicator isVisible />
                    </Title>
                    <Divider my="md" />
                    <Text size="sm" c="charcoal.7" mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    <Textarea
                        id="resubmissionNote"
                        aria-label="Resubmission Note"
                        placeholder="Ex. Summarize the modifications made to your submitted code, including specific sections revised, issues identified by the reviewer that have been addressed, and the rationale behind your resubmission."
                        autosize
                        minRows={5}
                        styles={{ input: { resize: 'vertical' } }}
                        value={value}
                        onChange={(e) => noteForm.setFieldValue('resubmissionNote', e.currentTarget.value)}
                        onBlur={() => noteForm.validateField('resubmissionNote')}
                        // Mantine spreads its own derived describedBy after the caller's props,
                        // so a hand-passed aria-describedby would be discarded.
                        {...nativeFieldProps(error, {
                            required: true,
                            describedBy: fieldDescribedBy('resubmissionNote', {
                                hasError: false,
                                hasDescription: false,
                                hasCounter: true,
                            }),
                        })}
                    />
                    <Group justify="space-between" align="center" mt={4}>
                        {/* The indicator sits beside the error node, not inside it: the textarea's
                            aria-describedby points at that id, and a live region in its subtree
                            would fold "All changes saved" into the field's description. */}
                        <Box>
                            <FieldErrorBox fieldId="resubmissionNote" error={error} isLive />
                            <SaveStatusIndicator status={saveStatus} isVisible={!error} />
                        </Box>
                        <CharacterCounter
                            id={fieldCounterId('resubmissionNote')}
                            count={characterCount}
                            maxCharacters={RESUBMIT_NOTE_MAX_CHARACTERS}
                        />
                    </Group>
                </Box>
            </Stack>
        </Paper>
    )
}
