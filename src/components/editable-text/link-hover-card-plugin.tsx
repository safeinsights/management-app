'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
    $setSelection,
    COMMAND_PRIORITY_LOW,
    isDOMNode,
    KEY_MODIFIER_COMMAND,
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
    hasPrimaryModifier,
    openLinkInNewTab,
    useClickWithoutDrag,
    useEscapeOnCard,
    useExclusiveLinkCard,
    useFocusOnOpen,
    useLinkCardTriggerAria,
    useRootDomListeners,
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

/** Cmd on a Mac and Ctrl elsewhere, which is what every editor with a link balloon uses. */
const OPEN_CARD_KEY = 'k'

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
            // The card takes focus, so the field holds no caret while it is open. Clearing the
            // selection is also what keeps it: Lexical re-applies its stored selection on the next
            // selectionchange, which pulls focus straight back out of the card.
            editor.update(() => $setSelection(null))
            setLink(found)
            setView('card')
        },
        [claim, editor],
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

    useRootDomListeners(editor, { mousedown: rememberPress, click: openFromClick })

    const openLinkAtCaret = useCallback(() => {
        // The committed state, not editor.read. A command dispatched from a keydown runs while
        // Lexical is mid-update, and reading the live editor there both answers with no range
        // selection and settles the pending one, so the caret's link goes missing either way.
        const found = editor.getEditorState().read($linkAtSelection)
        if (!found) return false

        open(found)
        return true
    }, [editor, open])

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(OPEN_LINK_CARD_COMMAND, openLinkAtCaret, COMMAND_PRIORITY_LOW),
            editor.registerCommand(
                KEY_MODIFIER_COMMAND,
                (event) => {
                    if (event.key.toLowerCase() !== OPEN_CARD_KEY || !hasPrimaryModifier(event)) return false
                    if (!openLinkAtCaret()) return false

                    // Held back until the card is open, so the browser keeps the key otherwise.
                    event.preventDefault()
                    return true
                },
                COMMAND_PRIORITY_LOW,
            ),
        )
    }, [editor, openLinkAtCaret])

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
        )
    }, [editor, link, close])

    const openInNewTab = useCallback(() => {
        if (link) openLinkInNewTab(link.url)
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

    // From the edit form, Escape discards it and returns to the card; from the card it closes.
    const handleEscape = useCallback(() => {
        if (view === 'edit') {
            setView('card')
            return
        }
        closeAndReturnFocus()
    }, [closeAndReturnFocus, view])

    return {
        link,
        view,
        close,
        handleEscape,
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
    useEscapeOnCard(card.link !== null, card.handleEscape)

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
    useFocusOnOpen(firstActionRef)

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

    useFocusOnOpen(textInputRef)

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
