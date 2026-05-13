'use client'

import { FC } from 'react'
import { Box, Divider, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { countWords } from '@/lib/word-count'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { RESUBMIT_NOTE_MAX_WORDS } from './schema'

interface ResubmissionNoteSectionProps {
    orgName: string
}

export const ResubmissionNoteSection: FC<ResubmissionNoteSectionProps> = ({ orgName }) => {
    const { noteForm } = useEditResubmit()
    const value = noteForm.values.resubmissionNote
    const error = noteForm.errors.resubmissionNote as string | undefined
    const wordCount = countWords(value)

    return (
        <Paper p="xxl" data-testid="resubmission-note-section">
            <Stack gap="md">
                <Box>
                    <Title order={4} c="charcoal.9">
                        Resubmission Note
                    </Title>
                    <Divider my="md" />
                    <Text size="sm" c="charcoal.7" mb="md">
                        {`Summarize the changes you’ve made based on the feedback from ${orgName}, or include any notes or questions.`}
                    </Text>
                    <FormFieldLabel label="Resubmission Note" required inputId="resubmissionNote" />
                    <Textarea
                        id="resubmissionNote"
                        aria-label="Resubmission Note"
                        placeholder="Ex. Revised sections, added details, and answered reviewer feedback"
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
