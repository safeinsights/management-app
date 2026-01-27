'use client'

import { ActionIcon, Paper, Portal } from '@mantine/core'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { TextBIcon, TextItalicIcon, TextUnderlineIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback, useEffect, useState } from 'react'
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    SELECTION_CHANGE_COMMAND,
    COMMAND_PRIORITY_LOW,
    TextFormatType,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'

// inspiration from https://konstantin.digital/blog/how-to-build-a-floating-menu-with-lexical-react

interface ToolbarPosition {
    top: number
    left: number
}

interface FormatState {
    isBold: boolean
    isItalic: boolean
    isUnderline: boolean
}

export const FloatingToolbar = () => {
    const [editor] = useLexicalComposerContext()
    const [position, setPosition] = useState<ToolbarPosition | null>(null)
    const [formatState, setFormatState] = useState<FormatState>({
        isBold: false,
        isItalic: false,
        isUnderline: false,
    })

    const updateToolbar = useCallback(() => {
        const selection = $getSelection()

        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            setPosition(null)
            return
        }

        setFormatState({
            isBold: selection.hasFormat('bold'),
            isItalic: selection.hasFormat('italic'),
            isUnderline: selection.hasFormat('underline'),
        })

        const nativeSelection = window.getSelection()
        if (!nativeSelection || nativeSelection.rangeCount === 0) {
            setPosition(null)
            return
        }

        const range = nativeSelection.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        if (rect.width === 0) {
            setPosition(null)
            return
        }

        setPosition({
            top: rect.top - 45 + window.scrollY,
            left: rect.left + rect.width / 2,
        })
    }, [])

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateToolbar()
                })
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbar()
                    return false
                },
                COMMAND_PRIORITY_LOW,
            ),
        )
    }, [editor, updateToolbar])

    const formatText = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    }

    if (!position) {
        return null
    }

    return (
        <Portal>
            <Paper
                shadow="md"
                p={4}
                style={{
                    position: 'absolute',
                    top: position.top,
                    left: position.left,
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    display: 'flex',
                    gap: 4,
                }}
            >
                <ActionIcon
                    variant={formatState.isBold ? 'filled' : 'subtle'}
                    size="sm"
                    onClick={() => formatText('bold')}
                    aria-label="Bold"
                >
                    <TextBIcon size={16} weight={formatState.isBold ? 'bold' : 'regular'} />
                </ActionIcon>
                <ActionIcon
                    variant={formatState.isItalic ? 'filled' : 'subtle'}
                    size="sm"
                    onClick={() => formatText('italic')}
                    aria-label="Italic"
                >
                    <TextItalicIcon size={16} weight={formatState.isItalic ? 'bold' : 'regular'} />
                </ActionIcon>
                <ActionIcon
                    variant={formatState.isUnderline ? 'filled' : 'subtle'}
                    size="sm"
                    onClick={() => formatText('underline')}
                    aria-label="Underline"
                >
                    <TextUnderlineIcon size={16} weight={formatState.isUnderline ? 'bold' : 'regular'} />
                </ActionIcon>
            </Paper>
        </Portal>
    )
}
