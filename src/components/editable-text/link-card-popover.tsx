'use client'

import {
    useCallback,
    useEffect,
    useRef,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
    type RefObject,
} from 'react'
import { Popover } from '@mantine/core'
import { useIsomorphicEffect } from '@mantine/hooks'
import type { LexicalEditor } from 'lexical'

const CARD_WIDTH = 420
const CLICK_OUTSIDE_EVENTS = ['mousedown', 'touchstart']
// Out of flow and sized to nothing, so mounting the card inside read-only content cannot add a
// line to a clamped block. Only the measured box matters, never where the host itself lands.
const ANCHOR_HOST_STYLE: CSSProperties = { position: 'absolute', top: 0, left: 0, width: 0, height: 0 }
const ANCHOR_STYLE: CSSProperties = { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }

/**
 * Lays the invisible anchor over the link, sized to it, so the card points where the link is. The
 * box is written to the element rather than held in state: this runs on every scroll frame, and a
 * render per frame would be wasteful. Both boxes are viewport relative, so their difference holds
 * however the field is scrolled.
 */
function useLinkAnchorPosition(
    editor: LexicalEditor,
    nodeKey: string | null,
    hostRef: RefObject<HTMLElement | null>,
    anchorRef: RefObject<HTMLElement | null>,
) {
    useIsomorphicEffect(() => {
        if (!nodeKey) return

        const position = () => {
            const host = hostRef.current
            const anchor = anchorRef.current
            const element = editor.getElementByKey(nodeKey)
            if (!host || !anchor || !element) return

            const linkBox = element.getBoundingClientRect()
            const hostBox = host.getBoundingClientRect()
            anchor.style.top = `${linkBox.top - hostBox.top}px`
            anchor.style.left = `${linkBox.left - hostBox.left}px`
            anchor.style.width = `${linkBox.width}px`
            anchor.style.height = `${linkBox.height}px`
        }

        position()
        const unregister = editor.registerUpdateListener(position)
        window.addEventListener('resize', position)
        // Capturing, because the field scrolls its own content and the host sits outside it.
        window.addEventListener('scroll', position, true)

        return () => {
            unregister()
            window.removeEventListener('resize', position)
            window.removeEventListener('scroll', position, true)
        }
    }, [editor, nodeKey, hostRef, anchorRef])
}

let closeOpenCard: (() => void) | null = null

/**
 * One link card at a time across the page, so opening one in another field closes this one. `close`
 * has to keep a stable identity.
 */
export function useExclusiveLinkCard(close: () => void) {
    const release = useCallback(() => {
        if (closeOpenCard === close) closeOpenCard = null
    }, [close])

    const claim = useCallback(() => {
        if (closeOpenCard && closeOpenCard !== close) closeOpenCard()
        closeOpenCard = close
    }, [close])

    useEffect(() => release, [release])

    return { claim }
}

/** The link keeps the popover semantics, since Lexical owns the anchor React cannot render into. */
export function useLinkCardTriggerAria(editor: LexicalEditor, nodeKey: string | null, dropdownId: string) {
    useEffect(() => {
        if (!nodeKey) return

        const apply = () => {
            const element = editor.getElementByKey(nodeKey)
            if (!element) return
            element.setAttribute('aria-expanded', 'true')
            element.setAttribute('aria-controls', dropdownId)
        }

        apply()
        // Lexical rebuilds the anchor on edits, dropping attributes set from outside.
        const unregister = editor.registerUpdateListener(apply)

        return () => {
            unregister()
            const element = editor.getElementByKey(nodeKey)
            element?.removeAttribute('aria-expanded')
            element?.removeAttribute('aria-controls')
        }
    }, [editor, nodeKey, dropdownId])
}

interface AnchoredLinkCardProps {
    editor: LexicalEditor
    nodeKey: string | null
    opened: boolean
    trapFocus: boolean
    /** False keeps the card inside the field, so interacting with it is not a blur (OTTER-647). */
    withinPortal: boolean
    floatingStrategy?: 'absolute' | 'fixed'
    dropdownId: string
    ariaLabel: string
    onDismiss: () => void
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
    children: ReactNode
}

export function AnchoredLinkCard({
    editor,
    nodeKey,
    opened,
    trapFocus,
    withinPortal,
    floatingStrategy,
    dropdownId,
    ariaLabel,
    onDismiss,
    onKeyDown,
    children,
}: AnchoredLinkCardProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const anchorRef = useRef<HTMLSpanElement>(null)
    useLinkAnchorPosition(editor, nodeKey, hostRef, anchorRef)

    // A press inside the card must not move the caret or read as leaving the field, but a press in
    // one of its inputs still has to place that input's own cursor.
    const keepEditorSelection = (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation()
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
    }

    return (
        <div ref={hostRef} style={ANCHOR_HOST_STYLE}>
            <Popover
                opened={opened}
                position="top"
                width={CARD_WIDTH}
                offset={8}
                shadow="md"
                radius="md"
                withArrow
                arrowSize={12}
                // The anchor is a synthetic box laid over the link rather than a laid-out element,
                // so the detached-reference check reads it as off-screen and hides the card.
                hideDetached={false}
                withinPortal={withinPortal}
                floatingStrategy={floatingStrategy}
                trapFocus={trapFocus}
                returnFocus={false}
                closeOnEscape={false}
                withRoles={false}
                clickOutsideEvents={CLICK_OUTSIDE_EVENTS}
                onDismiss={onDismiss}
            >
                <Popover.Target>
                    <span ref={anchorRef} aria-hidden style={ANCHOR_STYLE} />
                </Popover.Target>
                <Popover.Dropdown
                    id={dropdownId}
                    role="dialog"
                    aria-label={ariaLabel}
                    p="sm"
                    onKeyDown={onKeyDown}
                    onMouseDown={keepEditorSelection}
                >
                    {children}
                </Popover.Dropdown>
            </Popover>
        </div>
    )
}
