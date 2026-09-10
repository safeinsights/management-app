'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
    COMMAND_PRIORITY_CRITICAL,
    COMMAND_PRIORITY_LOW,
    isDOMNode,
    KEY_ESCAPE_COMMAND,
    SELECTION_CHANGE_COMMAND,
    type LexicalEditor,
} from 'lexical'
import { LINK_CARD_DIALOG_LABEL, LINK_EDIT_DIALOG_LABEL } from '@/components/link-hover-card/copy'
import { LinkEditForm, type LinkEditValues } from '@/components/link-hover-card/link-edit-form'
import { LinkHoverCard } from '@/components/link-hover-card/link-hover-card'
import { useLinkPreview } from '@/components/link-hover-card/use-link-preview'
import { linkAttributes } from './config'
import {
    AnchoredLinkCard,
    useClickWithoutDrag,
    useExclusiveLinkCard,
    useLinkCardTriggerAria,
} from './link-card-popover'
import {
    $linkAtDomNode,
    $linkAtSelection,
    $selectionLeftLink,
    $selectLinkEnd,
    $unwrapLink,
    $updateLink,
    OPEN_LINK_CARD_COMMAND,
    type LinkCardTarget,
} from './link-card-node'

type CardView = 'card' | 'edit'

function useEditorLinkCard(editor: LexicalEditor) {
    const [link, setLink] = useState<LinkCardTarget | null>(null)
    const [view, setView] = useState<CardView>('card')

    const close = useCallback(() => {
        setLink(null)
        setView('card')
    }, [])

    const { claim } = useExclusiveLinkCard(close)

    const open = useCallback(
        (found: LinkCardTarget) => {
            claim()
            setLink(found)
            setView('card')
        },
        [claim],
    )

    const closeAndReturnFocus = useCallback(() => {
        const nodeKey = link?.nodeKey
        close()
        if (!nodeKey) return
        // The field is focused directly because Lexical's own focus() only marks the selection
        // dirty, which moves the caret but not DOM focus.
        editor.getRootElement()?.focus()
        editor.update(() => $selectLinkEnd(nodeKey))
    }, [close, editor, link])

    const { rememberPress, movedSincePress } = useClickWithoutDrag()

    const openFromClick = useCallback(
        (event: MouseEvent) => {
            // Modified and middle clicks belong to the browser, and a click that ends a drag is
            // the user selecting text rather than reaching for the link.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            if (movedSincePress(event)) return
            if (!isDOMNode(event.target)) return

            const target = event.target
            const found = editor.read(() => $linkAtDomNode(target))
            if (found) open(found)
        },
        [editor, movedSincePress, open],
    )

    useEffect(() => {
        return editor.registerRootListener((rootElement, prevRootElement) => {
            prevRootElement?.removeEventListener('mousedown', rememberPress)
            prevRootElement?.removeEventListener('click', openFromClick)
            rootElement?.addEventListener('mousedown', rememberPress)
            rootElement?.addEventListener('click', openFromClick)
        })
    }, [editor, openFromClick, rememberPress])

    useEffect(() => {
        return editor.registerCommand(
            OPEN_LINK_CARD_COMMAND,
            () => {
                const found = editor.read($linkAtSelection)
                if (!found) return false
                open(found)
                return true
            },
            COMMAND_PRIORITY_LOW,
        )
    }, [editor, open])

    useEffect(() => {
        if (!link) return

        const closeIfCaretLeft = () => {
            const root = editor.getRootElement()
            // Only while the field holds focus: the card takes focus as it opens, and a selection
            // change with the editor blurred is not the user moving the caret out of the link.
            if (!root?.contains(document.activeElement)) return
            if (editor.read(() => $selectionLeftLink(link.nodeKey))) close()
        }

        return mergeRegister(
            editor.registerUpdateListener(closeIfCaretLeft),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    closeIfCaretLeft()
                    return false
                },
                COMMAND_PRIORITY_LOW,
            ),
            // Above EscapeFocusPlugin, which would otherwise blur the whole field.
            editor.registerCommand(
                KEY_ESCAPE_COMMAND,
                () => {
                    closeAndReturnFocus()
                    return true
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
        )
    }, [editor, link, close, closeAndReturnFocus])

    const openInNewTab = useCallback(() => {
        if (link) window.open(link.url, '_blank', 'noopener,noreferrer')
    }, [link])

    const startEdit = useCallback(() => setView('edit'), [])
    const cancelEdit = useCallback(() => setView('card'), [])

    const saveLink = useCallback(
        ({ text, url }: LinkEditValues) => {
            if (!link) return

            const { nodeKey } = link
            editor.update(() => $updateLink(nodeKey, url, text, linkAttributes))
            setLink({ nodeKey, url, target: linkAttributes.target ?? null, text: text || link.text })
            setView('card')
        },
        [editor, link],
    )

    const removeLink = useCallback(() => {
        if (!link) return

        const { nodeKey } = link
        close()
        editor.getRootElement()?.focus()
        editor.update(() => $unwrapLink(nodeKey))
    }, [close, editor, link])

    const handleKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()

            if (view === 'edit') {
                setView('card')
                return
            }
            closeAndReturnFocus()
        },
        [closeAndReturnFocus, view],
    )

    return {
        link,
        view,
        close,
        handleKeyDown,
        openInNewTab,
        startEdit,
        cancelEdit,
        saveLink,
        removeLink,
    }
}

type EditorLinkCard = ReturnType<typeof useEditorLinkCard>

export function LinkHoverCardPlugin() {
    const [editor] = useLexicalComposerContext()
    const card = useEditorLinkCard(editor)
    const dropdownId = useId()

    useLinkCardTriggerAria(editor, card.link?.nodeKey ?? null, dropdownId)

    const ariaLabel = card.view === 'edit' ? LINK_EDIT_DIALOG_LABEL : LINK_CARD_DIALOG_LABEL

    return (
        <AnchoredLinkCard
            editor={editor}
            nodeKey={card.link?.nodeKey ?? null}
            opened={card.link !== null}
            trapFocus={card.view === 'edit'}
            withinPortal={false}
            floatingStrategy="fixed"
            dropdownId={dropdownId}
            ariaLabel={ariaLabel}
            onDismiss={card.close}
            onKeyDown={card.handleKeyDown}
        >
            <LinkCardContent card={card} />
        </AnchoredLinkCard>
    )
}

function LinkCardContent({ card }: { card: EditorLinkCard }) {
    if (!card.link) return null

    if (card.view === 'edit') {
        return <LinkEditBody link={card.link} onCancel={card.cancelEdit} onSave={card.saveLink} />
    }

    return (
        <LinkCardBody
            link={card.link}
            onOpenInNewTab={card.openInNewTab}
            onEdit={card.startEdit}
            onRemove={card.removeLink}
        />
    )
}

function LinkCardBody({
    link,
    onOpenInNewTab,
    onEdit,
    onRemove,
}: {
    link: LinkCardTarget
    onOpenInNewTab: () => void
    onEdit: () => void
    onRemove: () => void
}) {
    const firstActionRef = useRef<HTMLButtonElement>(null)

    // OTTER-776 asks for focus to land in the card as it opens, from click as well as keyboard.
    useEffect(() => {
        firstActionRef.current?.focus()
    }, [])

    const preview = useLinkPreview(link.url)

    return (
        <LinkHoverCard
            preview={preview}
            mode="edit"
            opensInNewTab={link.target === '_blank'}
            firstActionRef={firstActionRef}
            onOpenInNewTab={onOpenInNewTab}
            onEdit={onEdit}
            onRemove={onRemove}
        />
    )
}

function LinkEditBody({
    link,
    onCancel,
    onSave,
}: {
    link: LinkCardTarget
    onCancel: () => void
    onSave: (values: LinkEditValues) => void
}) {
    const textInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        textInputRef.current?.focus()
    }, [])

    return (
        <LinkEditForm
            initialText={link.text}
            initialUrl={link.url}
            textInputRef={textInputRef}
            onCancel={onCancel}
            onSave={onSave}
        />
    )
}
