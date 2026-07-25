'use client'

import { useState } from 'react'
import { Box, Group, Paper, Stack, Text } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'

import { FormFieldLabel } from '@/components/form-field-label'
import { InputError } from '@/components/errors'
import { WordCounter } from '@/components/word-counter'
import { Editor } from '@/components/editable-text/editor'
import { useProposalRevision } from '@/hooks/use-start-proposal-revision'
import { proposalTextFieldDocName, type ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countWordsFromLexical } from '@/lib/lexical'
import { type EditableTextField } from './field-config'

const contentStyle = {
    minHeight: 200,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type Props = {
    studyId: string
    field: EditableTextField & { id: ProposalTextFieldKey }
    initialValue: string
    error: string | undefined
    onChange: (val: string) => void
    websocketProvider: HocuspocusProviderWebsocket | null
}

type ProposalEditorProps = {
    docName: string
    studyId: string
    initialValue: string
    placeholder: string | undefined
    ariaLabel: string
    onTextChange: (json: string) => void
    onLocalUserEdit?: () => void
    websocketProvider: HocuspocusProviderWebsocket | null
}

function ProposalTextEditor({
    docName,
    studyId,
    initialValue,
    placeholder,
    ariaLabel,
    onTextChange,
    onLocalUserEdit,
    websocketProvider,
}: ProposalEditorProps) {
    return (
        <Editor
            id={docName}
            studyId={studyId}
            initialValue={initialValue}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            placeholder={placeholder}
            ariaLabel={ariaLabel}
            onChange={onTextChange}
            onLocalUserEdit={onLocalUserEdit}
        />
    )
}

export function CollaborativeProposalTextField({
    studyId,
    field,
    initialValue,
    error,
    onChange,
    websocketProvider,
}: Props) {
    const [wordCount, setWordCount] = useState(() => countWordsFromLexical(initialValue))
    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)
    // No-op outside the edit-and-resubmit flow (no provider mounted on the fresh-draft form).
    const { signalRealEdit } = useProposalRevision()

    const onTextChange = (json: string) => {
        onChange(json)
        setWordCount(countWordsFromLexical(json))
    }

    return (
        <Paper p="xxl">
            <Stack gap="xxl">
                <Box>
                    <FormFieldLabel label={field.label} required={field.required} inputId={field.id} />
                    <Text size="xs" c="charcoal.7" mb="xs">
                        {field.description}
                    </Text>
                    <ProposalTextEditor
                        docName={docName}
                        studyId={studyId}
                        initialValue={initialValue}
                        placeholder={field.placeholder}
                        ariaLabel={field.label}
                        onTextChange={onTextChange}
                        onLocalUserEdit={signalRealEdit}
                        websocketProvider={websocketProvider}
                    />
                    <Group justify={error ? 'space-between' : 'flex-end'} mt={4}>
                        {error && <InputError error={error} />}
                        <WordCounter wordCount={wordCount} maxWords={field.maxWords} />
                    </Group>
                </Box>
            </Stack>
        </Paper>
    )
}
