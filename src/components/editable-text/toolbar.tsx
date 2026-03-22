'use client'

import { ActionIcon, Box, Paper, Portal, TextInput, Tooltip } from '@mantine/core'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
    CheckIcon,
    XIcon,
    TextBIcon,
    TextItalicIcon,
    TextUnderlineIcon,
    LinkIcon,
    ListBulletsIcon,
    ListNumbersIcon,
} from '@phosphor-icons/react/dist/ssr'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    $getSelection,
    $isRangeSelection,
    BLUR_COMMAND,
    FOCUS_COMMAND,
    FORMAT_TEXT_COMMAND,
    SELECTION_CHANGE_COMMAND,
    COMMAND_PRIORITY_LOW,
    TextFormatType,
} from 'lexical'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { isValidUrl } from './config'
import {
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    REMOVE_LIST_COMMAND,
    $isListNode,
    ListNode,
} from '@lexical/list'
import { $getNearestNodeOfType, mergeRegister } from '@lexical/utils'

// inspiration from https://konstantin.digital/blog/how-to-build-a-floating-menu-with-lexical-react

interface ToolbarPosition {
    top: number
    left: number
}

interface FormatState {
    isBold: boolean
    isItalic: boolean
    isUnderline: boolean
    isLink: boolean
    listType: 'bullet' | 'number' | null
}

function useLinkEditor(editor: ReturnType<typeof useLexicalComposerContext>[0]) {
    const [isEditing, setIsEditing] = useState(false)
    const [url, setUrl] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const openLinkEditor = useCallback((currentUrl: string | null) => {
        setUrl(currentUrl ?? 'https://')
        setIsEditing(true)
        // Focus the input after React renders it
        setTimeout(() => inputRef.current?.focus(), 0)
    }, [])

    const submitLink = useCallback(() => {
        const trimmed = url.trim()
        if (trimmed && isValidUrl(trimmed)) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, trimmed)
        } else {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
        }
        setIsEditing(false)
    }, [editor, url])

    const cancelLink = useCallback(() => {
        setIsEditing(false)
    }, [])

    return { isEditing, url, setUrl, inputRef, openLinkEditor, submitLink, cancelLink }
}

function useEditorPosition(editor: ReturnType<typeof useLexicalComposerContext>[0]) {
    const [position, setPosition] = useState<ToolbarPosition | null>(null)

    const update = useCallback(() => {
        const root = editor.getRootElement()
        if (!root) return null
        const rect = root.getBoundingClientRect()
        setPosition({ top: rect.bottom + window.scrollY, left: rect.left })
        return true
    }, [editor])

    return { position, update }
}

export const FloatingToolbar = () => {
    const [editor] = useLexicalComposerContext()
    const [isFocused, setIsFocused] = useState(false)
    const [formatState, setFormatState] = useState<FormatState>({
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isLink: false,
        listType: null,
    })

    const linkEditor = useLinkEditor(editor)
    const { position, update: updatePosition } = useEditorPosition(editor)

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                FOCUS_COMMAND,
                () => {
                    setIsFocused(true)
                    updatePosition()
                    return false
                },
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerCommand(
                BLUR_COMMAND,
                () => {
                    setIsFocused(false)
                    return false
                },
                COMMAND_PRIORITY_LOW,
            ),
        )
    }, [editor, updatePosition])

    const updateToolbar = useCallback(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return

        const anchorNode = selection.anchor.getNode()
        const parent = anchorNode.getParent()

        setFormatState({
            isBold: selection.hasFormat('bold'),
            isItalic: selection.hasFormat('italic'),
            isUnderline: selection.hasFormat('underline'),
            isLink: $isLinkNode(parent) || $isLinkNode(anchorNode),
            listType: (() => {
                const listNode = $getNearestNodeOfType(anchorNode, ListNode)
                if (!listNode || !$isListNode(listNode)) return null
                return listNode.getListType() === 'number' ? 'number' : 'bullet'
            })(),
        })
    }, [])

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    updateToolbar()
                })
                updatePosition()
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
    }, [editor, updateToolbar, updatePosition])

    const formatText = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
    }

    const toggleLink = () => {
        editor.getEditorState().read(() => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return

            const node = selection.anchor.getNode()
            const parent = node.getParent()
            const existingUrl = $isLinkNode(parent) ? parent.getURL() : $isLinkNode(node) ? node.getURL() : null

            if (existingUrl) {
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
            } else {
                linkEditor.openLinkEditor(null)
            }
        })
    }

    const toggleList = (type: 'bullet' | 'number') => {
        if (formatState.listType === type) {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
            const command = type === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND
            editor.dispatchCommand(command, undefined)
        }
    }

    if (!isFocused && !linkEditor.isEditing) return null
    if (!position) return null

    return (
        <Portal>
            <Paper
                shadow="md"
                p={4}
                onMouseDown={(e: React.MouseEvent) => {
                    if (!(e.target instanceof HTMLInputElement)) {
                        e.preventDefault()
                    }
                }}
                style={{
                    position: 'absolute',
                    top: position.top,
                    left: position.left,
                    zIndex: 1000,
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                }}
            >
                {linkEditor.isEditing ? (
                    <LinkInput
                        url={linkEditor.url}
                        onChange={linkEditor.setUrl}
                        onSubmit={linkEditor.submitLink}
                        onCancel={linkEditor.cancelLink}
                        inputRef={linkEditor.inputRef}
                    />
                ) : (
                    <FormatButtons
                        formatState={formatState}
                        onFormatText={formatText}
                        onToggleLink={toggleLink}
                        onToggleList={toggleList}
                    />
                )}
            </Paper>
        </Portal>
    )
}

function LinkInput({
    url,
    onChange,
    onSubmit,
    onCancel,
    inputRef,
}: {
    url: string
    onChange: (url: string) => void
    onSubmit: () => void
    onCancel: () => void
    inputRef: React.RefObject<HTMLInputElement | null>
}) {
    return (
        <Box style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <TextInput
                ref={inputRef}
                size="xs"
                value={url}
                onChange={(e) => onChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit()
                    if (e.key === 'Escape') onCancel()
                }}
                placeholder="https://"
                style={{ width: 200 }}
            />
            <Tooltip label="Apply">
                <ActionIcon size="sm" variant="subtle" color="green" onClick={onSubmit} aria-label="Apply link">
                    <CheckIcon size={14} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Cancel">
                <ActionIcon size="sm" variant="subtle" color="red" onClick={onCancel} aria-label="Cancel link">
                    <XIcon size={14} />
                </ActionIcon>
            </Tooltip>
        </Box>
    )
}

function FormatButtons({
    formatState,
    onFormatText,
    onToggleLink,
    onToggleList,
}: {
    formatState: FormatState
    onFormatText: (format: TextFormatType) => void
    onToggleLink: () => void
    onToggleList: (type: 'bullet' | 'number') => void
}) {
    return (
        <>
            <ActionIcon
                variant={formatState.isBold ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={() => onFormatText('bold')}
                aria-label="Bold"
            >
                <TextBIcon size={16} weight={formatState.isBold ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isItalic ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={() => onFormatText('italic')}
                aria-label="Italic"
            >
                <TextItalicIcon size={16} weight={formatState.isItalic ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isUnderline ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={() => onFormatText('underline')}
                aria-label="Underline"
            >
                <TextUnderlineIcon size={16} weight={formatState.isUnderline ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isLink ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={onToggleLink}
                aria-label="Link"
            >
                <LinkIcon size={16} weight={formatState.isLink ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.listType === 'bullet' ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={() => onToggleList('bullet')}
                aria-label="Bullet list"
            >
                <ListBulletsIcon size={16} weight={formatState.listType === 'bullet' ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.listType === 'number' ? 'filled' : 'subtle'}
                color="charcoal.4"
                size="sm"
                onClick={() => onToggleList('number')}
                aria-label="Numbered list"
            >
                <ListNumbersIcon size={16} weight={formatState.listType === 'number' ? 'bold' : 'regular'} />
            </ActionIcon>
        </>
    )
}
