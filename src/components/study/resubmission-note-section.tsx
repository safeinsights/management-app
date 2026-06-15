'use client'

import { FC } from 'react'
import { Box, Divider, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { type UseFormReturnType } from '@mantine/form'
import dayjs from 'dayjs'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { countWords } from '@/lib/lexical'
import {
    RESUBMIT_NOTE_MAX_WORDS,
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

function autosaveLabel(status: ResubmissionNoteAutosaveStatus): string | null {
    if (status.isSaving) return 'Saving…'
    if (status.lastSavedAt) return `All changes saved at ${dayjs(status.lastSavedAt).format('h:mm A')}`
    return null
}

export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ noteForm, orgName, autosaveStatus }) => {
    const value = noteForm.values.resubmissionNote
    const error = noteForm.errors.resubmissionNote as string | undefined
    const wordCount = countWords(value)
    const statusLabel = autosaveStatus ? autosaveLabel(autosaveStatus) : null

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Group justify="space-between" align="baseline">
                        <Title order={4} c="charcoal.9">
                            Resubmission Note
                        </Title>
                        {statusLabel && (
                            <Text size="sm" c="dimmed" data-testid="autosave-status">
                                {statusLabel}
                            </Text>
                        )}
                    </Group>
                    <Divider my="md" />
                    <Text size="sm" c="charcoal.7" mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    <FormFieldLabel label="Resubmission Note" required inputId="resubmissionNote" />
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
                        error={!!error}
                    />
                    <Group justify={error ? 'space-between' : 'flex-end'} mt={4}>
                        {error && <InputError error={error} />}
                        <WordCounter wordCount={wordCount} maxWords={RESUBMIT_NOTE_MAX_WORDS} />
                    </Group>
                </Box>
            </Stack>
        </Paper>
    )
}
