'use client'

import { ActionIcon, Box, Paper, Portal, TextInput } from '@mantine/core'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
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
    FORMAT_TEXT_COMMAND,
    SELECTION_CHANGE_COMMAND,
    COMMAND_PRIORITY_LOW,
    TextFormatType,
} from 'lexical'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
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
        if (url.trim()) {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim())
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

export const FloatingToolbar = () => {
    const [editor] = useLexicalComposerContext()
    const [position, setPosition] = useState<ToolbarPosition | null>(null)
    const [formatState, setFormatState] = useState<FormatState>({
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isLink: false,
        listType: null,
    })

    const linkEditor = useLinkEditor(editor)

    const updateToolbar = useCallback(() => {
        const selection = $getSelection()

        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            if (!linkEditor.isEditing) {
                setPosition(null)
            }
            return
        }

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
    }, [linkEditor.isEditing])

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
                size="sm"
                onClick={() => onFormatText('bold')}
                aria-label="Bold"
            >
                <TextBIcon size={16} weight={formatState.isBold ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isItalic ? 'filled' : 'subtle'}
                size="sm"
                onClick={() => onFormatText('italic')}
                aria-label="Italic"
            >
                <TextItalicIcon size={16} weight={formatState.isItalic ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isUnderline ? 'filled' : 'subtle'}
                size="sm"
                onClick={() => onFormatText('underline')}
                aria-label="Underline"
            >
                <TextUnderlineIcon size={16} weight={formatState.isUnderline ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.isLink ? 'filled' : 'subtle'}
                size="sm"
                onClick={onToggleLink}
                aria-label="Link"
            >
                <LinkIcon size={16} weight={formatState.isLink ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.listType === 'bullet' ? 'filled' : 'subtle'}
                size="sm"
                onClick={() => onToggleList('bullet')}
                aria-label="Bullet list"
            >
                <ListBulletsIcon size={16} weight={formatState.listType === 'bullet' ? 'bold' : 'regular'} />
            </ActionIcon>
            <ActionIcon
                variant={formatState.listType === 'number' ? 'filled' : 'subtle'}
                size="sm"
                onClick={() => onToggleList('number')}
                aria-label="Numbered list"
            >
                <ListNumbersIcon size={16} weight={formatState.listType === 'number' ? 'bold' : 'regular'} />
            </ActionIcon>
        </>
    )
}
