'use client'

import { LexicalComposer, InitialConfigType } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { EditorState, SerializedEditorState } from 'lexical'
import { FC, ReactNode, useEffect, useState } from 'react'
import { Box } from '@mantine/core'
import { InputError } from '@/components/errors'
import { countWords } from '@/lib/word-count'
import logger from '@/lib/logger'
import { FloatingToolbar } from './editable-text/toolbar'

export interface EditableTextProps {
    /** Serialized Lexical JSON state */
    value?: string
    /** Callback when content changes, receives serialized Lexical JSON */
    onChange?: (value: string) => void
    /** Called when editor gains focus */
    onFocus?: () => void
    /** Called when editor loses focus */
    onBlur?: () => void
    /** Validation error to display */
    error?: ReactNode
    /** Placeholder text shown when editor is empty */
    placeholder?: string
    /** Disable editing */
    disabled?: boolean
    /** Make content read-only */
    readOnly?: boolean
    /** Remove border and padding for inline display */
    borderless?: boolean
    /** Minimum height of the editor */
    minHeight?: number | string
    /** Maximum height of the editor (enables scrolling) */
    maxHeight?: number | string
    /** Allow user to manually resize the editor vertically */
    resizable?: boolean
    /** HTML id attribute for the editor */
    id?: string
    /** Accessible label for the editor */
    'aria-label'?: string
    /** Callback fired when word count changes */
    onWordCount?: (count: number) => void
}

const theme = {
    text: {
        bold: 'editable-text-bold',
        italic: 'editable-text-italic',
        underline: 'editable-text-underline',
    },
}

function createInitialConfig(value: string | undefined, disabled: boolean, readOnly: boolean): InitialConfigType {
    let editorState: SerializedEditorState | undefined
    if (value) {
        try {
            editorState = JSON.parse(value) as SerializedEditorState
        } catch {
            // Invalid JSON, start with empty state
        }
    }

    return {
        namespace: 'EditableText',
        theme,
        editable: !disabled && !readOnly,
        editorState: editorState ? JSON.stringify(editorState) : undefined,
        onError: (error: Error) => {
            logger.error('Lexical error:', error)
        },
    }
}

function WordCountPlugin({ onWordCount }: { onWordCount: (count: number) => void }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerTextContentListener((textContent) => {
            onWordCount(countWords(textContent))
        })
    }, [editor, onWordCount])

    return null
}

export const EditableText: FC<EditableTextProps> = ({
    value,
    onChange,
    onFocus,
    onBlur,
    error,
    placeholder = 'Enter text...',
    disabled = false,
    readOnly = false,
    borderless = false,
    minHeight = 100,
    maxHeight,
    resizable = true,
    id,
    'aria-label': ariaLabel,
    onWordCount,
}) => {
    // Use useState with lazy initializer - computed once on mount
    // Lexical manages its own state after initialization
    const [initialConfig] = useState<InitialConfigType>(() => createInitialConfig(value, disabled, readOnly))

    const handleChange = (editorState: EditorState) => {
        onChange?.(JSON.stringify(editorState.toJSON()))
    }

    const isEditable = !disabled && !readOnly

    return (
        <Box>
            <LexicalComposer initialConfig={initialConfig}>
                <Box
                    style={{
                        position: 'relative',
                        border: borderless
                            ? 'none'
                            : `1px solid var(${error ? '--mantine-color-red-filled' : '--mantine-color-gray-4'})`,
                        borderRadius: borderless ? undefined : 'var(--mantine-radius-sm)',
                        minHeight: borderless ? undefined : minHeight,
                        maxHeight,
                        overflow: maxHeight || resizable ? 'auto' : undefined,
                        resize: borderless ? undefined : resizable ? 'vertical' : undefined,
                        backgroundColor: disabled ? 'var(--mantine-color-gray-1)' : undefined,
                    }}
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                id={id}
                                aria-label={ariaLabel}
                                style={{
                                    outline: 'none',
                                    padding: borderless ? 0 : 'var(--mantine-spacing-sm)',
                                    minHeight: borderless ? undefined : minHeight,
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                            />
                        }
                        placeholder={
                            <Box
                                style={{
                                    position: 'absolute',
                                    top: 'var(--mantine-spacing-sm)',
                                    left: 'var(--mantine-spacing-sm)',
                                    color: 'var(--mantine-color-gray-5)',
                                    pointerEvents: 'none',
                                    userSelect: 'none',
                                }}
                            >
                                {placeholder}
                            </Box>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={handleChange} />
                    {onWordCount && <WordCountPlugin onWordCount={onWordCount} />}
                    {isEditable && <FloatingToolbar />}
                </Box>
            </LexicalComposer>
            {error && typeof error !== 'boolean' && (
                <Box mt="xs">
                    <InputError error={error} />
                </Box>
            )}
        </Box>
    )
}
