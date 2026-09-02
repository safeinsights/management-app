'use client'

import { useState, type FC } from 'react'
import { Paper, Stack } from '@mantine/core'
import type { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import type { UseFormReturnType } from '@mantine/form'

import { fieldCounterId, FormField, fieldDescribedBy } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { Editor } from '@/components/editable-text/editor'
import { proposalTextFieldDocName, type ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { countCharactersFromLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'
import { type EditableTextField } from './field-config'
import { textFieldInputId } from './field-ids'
import { type ProposalFormValues } from './schema'

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
    // Opt-in: Step 2 renders no placeholders (OTTER-691) while the resubmit page still does.
    placeholder?: string
    // Opt-in: Step 2 has per-field heights (OTTER-691) while the resubmit page keeps one uniform
    // height.
    contentHeight?: number
    isResizable?: boolean
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
    contentHeight,
    isResizable,
}: Props) {
    const [characterCount, setCharacterCount] = useState(() => countCharactersFromLexical(initialValue))
    const docName = proposalTextFieldDocName(studyId, field.id as ProposalTextFieldKey)
    // The editor surface needs its own DOM id; `docName` is the Yjs document key.
    const inputId = textFieldInputId(field.id)

    const onTextChange = (json: string) => {
        onChange(json)
        setCharacterCount(countCharactersFromLexical(json))
    }

    // An emptied optional field raises no error to take the label's slot, so the label would
    // otherwise sit alone under an empty box. Required fields keep it until their error lands.
    const isSaveStatusVisible = !!field.required || characterCount > 0

    return (
        <Paper p="xxl">
            <Stack gap="xxl">
                <FormField
                    inputId={inputId}
                    label={field.label}
                    required={field.required}
                    description={field.description}
                    error={error}
                    footer={
                        <CharacterCounter
                            id={fieldCounterId(inputId)}
                            count={characterCount}
                            maxCharacters={field.maxCharacters}
                        />
                    }
                    // The character-limit error appears mid-typing, before focus moves, so it has
                    // to announce itself (OTTER-690).
                    errorLive
                >
                    <Editor
                        id={docName}
                        inputId={inputId}
                        studyId={studyId}
                        initialValue={initialValue}
                        websocketProvider={websocketProvider}
                        contentStyle={contentStyle}
                        contentHeight={contentHeight}
                        isResizable={isResizable}
                        placeholder={placeholder}
                        ariaLabel={field.label}
                        onChange={onTextChange}
                        onBlur={onBlur}
                        error={error}
                        isSaveStatusVisible={isSaveStatusVisible}
                        ariaRequired={field.required}
                        ariaDescribedBy={fieldDescribedBy(inputId, {
                            hasError: !!error,
                            hasDescription: !!field.description,
                            hasCounter: true,
                        })}
                    />
                </FormField>
            </Stack>
        </Paper>
    )
}

export const ProposalTextFieldEntry: FC<{
    field: EditableTextField
    form: UseFormReturnType<ProposalFormValues>
    studyId: string
    websocketProvider: HocuspocusProviderWebsocket | null
    placeholder?: string
    contentHeight?: number
    isResizable?: boolean
    // Only the over-limit half of the rule is live; the required half belongs to blur and Submit,
    // so clearing the box does not flash an error mid-edit.
    liveCharacterLimit?: boolean
}> = ({
    field,
    form,
    studyId,
    websocketProvider,
    placeholder,
    contentHeight,
    isResizable,
    liveCharacterLimit = false,
}) => {
    const value = form.values[field.id] as string
    const error = form.errors[field.id] as string | undefined

    const onChange = (val: string) => {
        form.setFieldValue(field.id, val)
        if (liveCharacterLimit && countCharactersFromLexical(val) > field.maxCharacters) {
            form.setFieldError(field.id, overCharacterLimitError(field.label, field.maxCharacters))
        }
    }

    return (
        <CollaborativeProposalTextField
            studyId={studyId}
            field={field as typeof field & { id: ProposalTextFieldKey }}
            initialValue={value}
            error={error}
            onChange={onChange}
            onBlur={() => form.validateField(field.id)}
            websocketProvider={websocketProvider}
            placeholder={placeholder}
            contentHeight={contentHeight}
            isResizable={isResizable}
        />
    )
}
