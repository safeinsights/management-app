'use client'

import { useState } from 'react'
import { Paper, Stack } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'

import { FormField, fieldDescribedBy } from '@/components/form-field'
import { WordCounter } from '@/components/word-counter'
import { Editor } from '@/components/editable-text/editor'
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
    onBlur: () => void
    websocketProvider: HocuspocusProviderWebsocket | null
}

export function CollaborativeProposalTextField({
    studyId,
    field,
    initialValue,
    error,
    onChange,
    onBlur,
    websocketProvider,
}: Props) {
    const [wordCount, setWordCount] = useState(() => countWordsFromLexical(initialValue))
    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)
    // The editor surface needs its own DOM id: `docName` is the Yjs document key.
    const inputId = `proposal-field-${field.id}`

    const onTextChange = (json: string) => {
        onChange(json)
        setWordCount(countWordsFromLexical(json))
    }

    return (
        <Paper p="xxl">
            <Stack gap="xxl">
                <FormField
                    inputId={inputId}
                    label={field.label}
                    required={field.required}
                    description={field.description}
                    error={error}
                    footer={<WordCounter wordCount={wordCount} maxWords={field.maxWords} />}
                >
                    <Editor
                        id={docName}
                        inputId={inputId}
                        studyId={studyId}
                        initialValue={initialValue}
                        websocketProvider={websocketProvider}
                        contentStyle={contentStyle}
                        placeholder={field.placeholder}
                        ariaLabel={field.label}
                        onChange={onTextChange}
                        onBlur={onBlur}
                        error={error}
                        ariaRequired={field.required}
                        ariaDescribedBy={fieldDescribedBy(inputId, {
                            hasError: !!error,
                            hasDescription: !!field.description,
                        })}
                    />
                </FormField>
            </Stack>
        </Paper>
    )
}
