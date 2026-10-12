'use client'

import { LexicalComposer, InitialConfigType } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LinkHoverCardReadOnlyPlugin } from './editable-text/link-hover-card-readonly-plugin'
import { EditorState, SerializedEditorState } from 'lexical'
import { FC, ReactNode, useState } from 'react'
import clsx from 'clsx'
import { Box, Stack } from '@mantine/core'
import { InputError } from '@/components/errors'
import { isValidLexicalState } from '@/lib/lexical'
import logger from '@/lib/logger'
import { Toolbar } from './editable-text/toolbar'
import { EscapeFocusPlugin } from './editable-text/escape-focus-plugin'
import { lexicalTheme, lexicalNodes, isValidUrl, linkAttributes } from './editable-text/config'
import classes from './editable-text/editor-surface.module.css'
import { semanticColor } from '@/theme/tokens'

export interface EditableTextProps {
    /** Serialized Lexical JSON state */
    value?: string
    onChange?: (value: string) => void
    onFocus?: () => void
    onBlur?: () => void
    error?: ReactNode
    placeholder?: string
    disabled?: boolean
    readOnly?: boolean
    /** Remove border and padding for inline display */
    borderless?: boolean
    minHeight?: number | string
    maxHeight?: number | string
    resizable?: boolean
    id?: string
    'aria-label'?: string
}

function createInitialConfig(value: string | undefined, disabled: boolean, readOnly: boolean): InitialConfigType {
    let editorState: SerializedEditorState | undefined
    // Lexical throws if initialized with an empty root, which legacy rows can hold.
    if (isValidLexicalState(value)) {
        editorState = JSON.parse(value!)
    }

    return {
        namespace: 'EditableText',
        theme: lexicalTheme,
        nodes: lexicalNodes,
        editable: !disabled && !readOnly,
        editorState: editorState ? JSON.stringify(editorState) : undefined,
        onError: (error: Error) => {
            logger.error('Lexical error:', error)
        },
    }
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
}) => {
    // Computed once on mount; Lexical owns its state from there.
    const [initialConfig] = useState<InitialConfigType>(() => createInitialConfig(value, disabled, readOnly))

    const handleChange = (editorState: EditorState) => {
        onChange?.(JSON.stringify(editorState.toJSON()))
    }

    const isEditable = !disabled && !readOnly

    return (
        <Box>
            <LexicalComposer initialConfig={initialConfig}>
                <Stack
                    gap={0}
                    className={clsx(classes.frame, !borderless && 'collaborative-editor-container')}
                    data-resizable={(!borderless && resizable) || undefined}
                    data-error={error ? true : undefined}
                    mih={borderless ? undefined : minHeight}
                    mah={maxHeight}
                    bg={disabled ? semanticColor('surface.disabled.medium') : undefined}
                >
                    <Box pos="relative" flex={1} className={classes.scrollArea}>
                        <RichTextPlugin
                            contentEditable={
                                <Box
                                    component={ContentEditable}
                                    id={id}
                                    aria-label={ariaLabel}
                                    className={classes.editable}
                                    p={borderless ? 0 : 'sm'}
                                    mih={borderless ? undefined : minHeight}
                                    onFocus={onFocus}
                                    onBlur={onBlur}
                                />
                            }
                            placeholder={
                                <Box
                                    pos="absolute"
                                    top="var(--mantine-spacing-sm)"
                                    left="var(--mantine-spacing-sm)"
                                    c={semanticColor('text.placeholder')}
                                    className={classes.placeholder}
                                >
                                    {placeholder}
                                </Box>
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />
                        <HistoryPlugin />
                        <ListPlugin />
                        {/* No TabIndentationPlugin: banned in eslint.config.mjs, which carries the why. */}
                        <EscapeFocusPlugin />
                        <LinkPlugin validateUrl={isValidUrl} attributes={linkAttributes} />
                        {/* Read-only renders show the link card on a click. While editing, a click
                            belongs to the caret, and the plugin stands aside. */}
                        <LinkHoverCardReadOnlyPlugin />
                        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
                    </Box>
                    {isEditable && <Toolbar />}
                </Stack>
            </LexicalComposer>
            {error && typeof error !== 'boolean' && (
                <Box mt="xs">
                    <InputError error={error} />
                </Box>
            )}
        </Box>
    )
}
