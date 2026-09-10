'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LINK_CARD_DIALOG_LABEL } from '@/components/link-hover-card/copy'
import { LinkHoverCard } from '@/components/link-hover-card/link-hover-card'
import { useLinkPreview } from '@/components/link-hover-card/use-link-preview'
import {
    AnchoredLinkCard,
    useClickWithoutDrag,
    useEscapeOnCard,
    useExclusiveLinkCard,
    useFocusOnOpen,
    useLinkCardTriggerAria,
} from './link-card-popover'
import { $linkAtDomNode, type LinkCardTarget } from './link-card-node'

const OPEN_KEYS = ['Enter', ' ']

const closestAnchor = (target: EventTarget | null) => (target instanceof Element ? target.closest('a') : null)

/**
 * Reading a proposal, a click on link text opens the card rather than following the link. Holding a
 * modifier, or clicking the middle button, still opens the destination straight away.
 */
export function LinkHoverCardReadOnlyPlugin() {
    const [editor] = useLexicalComposerContext()
    const [link, setLink] = useState<LinkCardTarget | null>(null)
    const triggerRef = useRef<HTMLAnchorElement | null>(null)
    const dropdownId = useId()

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

            // Nothing here ever navigates the SafeInsights tab away (OTTER-463).
            event.preventDefault()

            // A click that ends a drag is the reader selecting text across the link.
            if (movedSincePress(event)) return

            if (event.button === 1 || event.metaKey || event.ctrlKey) {
                window.open(hit.found.url, '_blank', 'noopener,noreferrer')
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

            // Enter would follow the link and Space would scroll the page.
            event.preventDefault()
            open(hit.found, hit.anchor)
        },
        [linkFromEvent, open],
    )

    useEffect(() => {
        return editor.registerRootListener((rootElement, prevRootElement) => {
            prevRootElement?.removeEventListener('mousedown', rememberPress)
            prevRootElement?.removeEventListener('click', handleClick)
            prevRootElement?.removeEventListener('auxclick', handleClick)
            prevRootElement?.removeEventListener('keydown', handleKeyDown)
            rootElement?.addEventListener('mousedown', rememberPress)
            rootElement?.addEventListener('click', handleClick)
            rootElement?.addEventListener('auxclick', handleClick)
            rootElement?.addEventListener('keydown', handleKeyDown)
        })
    }, [editor, handleClick, handleKeyDown, rememberPress])

    useLinkCardTriggerAria(editor, link?.nodeKey ?? null, dropdownId)
    useEscapeOnCard(link !== null, closeAndReturnFocus)

    return (
        <AnchoredLinkCard
            editor={editor}
            nodeKey={link?.nodeKey ?? null}
            opened={link !== null}
            trapFocus={false}
            withinPortal
            dropdownId={dropdownId}
            ariaLabel={LINK_CARD_DIALOG_LABEL}
            onDismiss={close}
        >
            <ReadOnlyCardContent link={link} />
        </AnchoredLinkCard>
    )
}

function ReadOnlyCardContent({ link }: { link: LinkCardTarget | null }) {
    if (!link) return null

    return <ReadOnlyCardBody link={link} />
}

function ReadOnlyCardBody({ link }: { link: LinkCardTarget }) {
    const firstActionRef = useRef<HTMLButtonElement>(null)

    useFocusOnOpen(firstActionRef)

    const preview = useLinkPreview(link.url)
    const openInNewTab = () => window.open(link.url, '_blank', 'noopener,noreferrer')

    return (
        <LinkHoverCard
            preview={preview}
            mode="readOnly"
            opensInNewTab={link.target === '_blank'}
            firstActionRef={firstActionRef}
            onOpenInNewTab={openInNewTab}
        />
    )
}
