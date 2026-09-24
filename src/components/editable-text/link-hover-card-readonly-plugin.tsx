'use client'

import { useCallback, useId, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor } from 'lexical'
import { LINK_CARD_DIALOG_LABEL } from '@/components/link-hover-card/copy'
import {
    OPEN_KEYS,
    openLinkInNewTab,
    useEscapeOnCard,
    useExclusiveLinkCard,
} from '@/components/link-hover-card/link-card-interactions'
import { ReadOnlyLinkCardBody } from '@/components/link-hover-card/read-only-link-card'
import {
    AnchoredLinkCard,
    hasPrimaryModifier,
    isSecondaryClick,
    useClickWithoutDrag,
    useLinkCardTriggerAria,
    useRootDomListeners,
} from './link-card-popover'
import { $linkAtDomNode, type LinkCardTarget } from './link-card-node'

const MIDDLE_BUTTON = 1

const closestAnchor = (target: EventTarget | null) => (target instanceof Element ? target.closest('a') : null)

function useReadOnlyLinkCard(editor: LexicalEditor) {
    const [link, setLink] = useState<LinkCardTarget | null>(null)
    const triggerRef = useRef<HTMLAnchorElement | null>(null)

    const close = useCallback(() => {
        setLink(null)
        triggerRef.current = null
    }, [])

    const { claim } = useExclusiveLinkCard(close)

    const closeAndReturnFocus = useCallback(() => {
        const trigger = triggerRef.current
        close()
        trigger?.focus()
    }, [close])

    const open = useCallback(
        (found: LinkCardTarget, trigger: HTMLAnchorElement) => {
            claim()
            triggerRef.current = trigger
            setLink(found)
        },
        [claim],
    )

    // The same component also mounts in the editable editor, where clicks belong to the caret.
    const linkFromEvent = useCallback(
        (target: EventTarget | null) => {
            if (editor.isEditable()) return null
            const anchor = closestAnchor(target)
            if (!anchor) return null

            const found = editor.read(() => $linkAtDomNode(anchor))
            return found ? { found, anchor } : null
        },
        [editor],
    )

    const { rememberPress, movedSincePress } = useClickWithoutDrag()

    const handleClick = useCallback(
        (event: MouseEvent) => {
            const hit = linkFromEvent(event.target)
            if (!hit) return

            // The context menu, a new window and a download all keep their usual meaning: none of
            // them unloads this tab, and the reader asked the browser for them, not for the card.
            if (isSecondaryClick(event) || event.shiftKey || event.altKey) return

            // Nothing past here ever navigates the SafeInsights tab away (OTTER-463).
            event.preventDefault()

            // A click that ends a drag is the reader selecting text across the link.
            if (movedSincePress(event)) return

            if (event.button === MIDDLE_BUTTON || hasPrimaryModifier(event)) {
                openLinkInNewTab(hit.found.url)
                return
            }

            open(hit.found, hit.anchor)
        },
        [linkFromEvent, movedSincePress, open],
    )

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!OPEN_KEYS.includes(event.key)) return

            const hit = linkFromEvent(event.target)
            if (!hit) return

            event.preventDefault()
            open(hit.found, hit.anchor)
        },
        [linkFromEvent, open],
    )

    useRootDomListeners(editor, {
        mousedown: rememberPress,
        click: handleClick,
        auxclick: handleClick,
        keydown: handleKeyDown,
    })

    return { link, close, closeAndReturnFocus }
}

/**
 * Reading a proposal, a click on link text opens the card rather than following the link. Holding a
 * modifier, or clicking the middle button, still opens the destination straight away.
 */
export function LinkHoverCardReadOnlyPlugin() {
    const [editor] = useLexicalComposerContext()
    const card = useReadOnlyLinkCard(editor)
    const dropdownId = useId()

    useLinkCardTriggerAria(editor, card.link?.nodeKey ?? null, dropdownId)
    useEscapeOnCard(card.link !== null, card.closeAndReturnFocus)

    return (
        <AnchoredLinkCard
            editor={editor}
            nodeKey={card.link?.nodeKey ?? null}
            opened={card.link !== null}
            trapFocus={false}
            withinPortal
            dropdownId={dropdownId}
            ariaLabel={LINK_CARD_DIALOG_LABEL}
            onDismiss={card.close}
        >
            <ReadOnlyCardContent link={card.link} />
        </AnchoredLinkCard>
    )
}

function ReadOnlyCardContent({ link }: { link: LinkCardTarget | null }) {
    if (!link) return null

    return <ReadOnlyLinkCardBody url={link.url} opensInNewTab={link.target === '_blank'} />
}
