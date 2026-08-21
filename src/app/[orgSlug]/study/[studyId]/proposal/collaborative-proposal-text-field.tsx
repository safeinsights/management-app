'use client'

import { useState } from 'react'
import { Paper, Stack } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'

import { FormField, fieldDescribedBy } from '@/components/form-field'
import { WordCounter } from '@/components/word-counter'
import { CharacterCounter } from '@/components/character-counter'
import { Editor } from '@/components/editable-text/editor'
import { proposalTextFieldDocName, type ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countCharactersFromLexical, countWordsFromLexical } from '@/lib/lexical'
import { type EditableTextField } from './field-config'
import { textFieldInputId } from './field-ids'

const contentStyle = {
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
    /**
     * Opt-in, because Step 2 renders no placeholders (OTTER-691) while the resubmit page still
     * does. Reading `field.placeholder` here instead would tie the two pages together, and the
     * card's scope is Step 2.
     */
    placeholder?: string
    /**
     * How this field's cap is measured. Step 2 counts characters (OTTER-691); the resubmit page
     * still counts words, and shares this component.
     */
    countMode?: 'words' | 'characters'
}

export function CollaborativeProposalTextField({
    studyId,
    field,
    initialValue,
    error,
    onChange,
    onBlur,
    websocketProvider,
    placeholder,
    countMode = 'words',
}: Props) {
    const countsCharacters = countMode === 'characters'
    const count = countsCharacters ? countCharactersFromLexical : countWordsFromLexical
    const [textCount, setTextCount] = useState(() => count(initialValue))
    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)
    // The editor surface needs its own DOM id: `docName` is the Yjs document key.
    const inputId = textFieldInputId(field.id)

    const counter = countsCharacters ? (
        <CharacterCounter count={textCount} maxCharacters={field.maxCharacters} />
    ) : (
        <WordCounter wordCount={textCount} maxWords={field.maxWords} />
    )

    const onTextChange = (json: string) => {
        onChange(json)
        setTextCount(count(json))
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
                    footer={counter}
                    // The character-limit error can appear while the user is still typing, before
                    // any blur or click moves focus, so it has to announce itself (OTTER-690's
                    // errorLive, built for the Step 1 title's identical case).
                    errorLive={countsCharacters}
                >
                    <Editor
                        id={docName}
                        inputId={inputId}
                        studyId={studyId}
                        initialValue={initialValue}
                        websocketProvider={websocketProvider}
                        contentStyle={contentStyle}
                        contentHeight={field.contentHeight}
                        placeholder={placeholder}
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
