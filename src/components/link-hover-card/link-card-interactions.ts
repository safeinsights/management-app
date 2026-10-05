'use client'

import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react'
import type { PopoverProps } from '@mantine/core'

/** The card's look, shared by the editor cards and the plain-link card so the two cannot drift. */
export const LINK_CARD_POPOVER_PROPS: Pick<
    PopoverProps,
    'position' | 'width' | 'offset' | 'shadow' | 'radius' | 'withArrow' | 'arrowSize' | 'clickOutsideEvents'
> = {
    position: 'top',
    width: 420,
    offset: 8,
    shadow: 'md',
    radius: 'md',
    withArrow: true,
    arrowSize: 12,
    clickOutsideEvents: ['mousedown', 'touchstart'],
}

// Enter would follow the link and Space would scroll the page, so both open the card instead.
export const OPEN_KEYS = ['Enter', ' ']

const PRIMARY_BUTTON = 0

type ModifierKeys = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

// Any modifier asks the browser for a new tab, a new window or the context menu, not for the card.
export const hasModifier = (event: ModifierKeys) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

export const wantsBrowserDefault = (event: ModifierKeys & { button: number }) =>
    event.button !== PRIMARY_BUTTON || hasModifier(event)

export function openLinkInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
}

// Time for the pointer to cross from the link into the card (WCAG 2.1 SC 1.4.13, hover content must be hoverable).
export const LINK_CARD_HOVER_CLOSE_DELAY_MS = 120

const MOUSE_POINTER = 'mouse'

/**
 * Enter and leave for hover content, with a grace period on leave. Touch and pen are ignored: iOS
 * turns a tap that changes content on hover into a hover only, so the tap would not follow the link.
 */
export function useHoverIntent({ onEnter, onLeave }: { onEnter: () => void; onLeave: () => void }) {
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pointerInside = useRef(false)

    const clearLeaveTimer = useCallback(() => {
        if (leaveTimer.current === null) return
        clearTimeout(leaveTimer.current)
        leaveTimer.current = null
    }, [])

    useEffect(() => clearLeaveTimer, [clearLeaveTimer])

    const onPointerEnter = useCallback(
        (event: PointerEvent) => {
            if (event.pointerType !== MOUSE_POINTER) return
            pointerInside.current = true
            clearLeaveTimer()
            onEnter()
        },
        [clearLeaveTimer, onEnter],
    )

    const onPointerLeave = useCallback(
        (event: PointerEvent) => {
            if (event.pointerType !== MOUSE_POINTER) return
            pointerInside.current = false
            clearLeaveTimer()
            leaveTimer.current = setTimeout(() => {
                leaveTimer.current = null
                onLeave()
            }, LINK_CARD_HOVER_CLOSE_DELAY_MS)
        },
        [clearLeaveTimer, onLeave],
    )

    // For a close that is not a pointer leave. A card removed from under the pointer gets no
    // pointerleave, so the flag would otherwise stay set.
    const reset = useCallback(() => {
        clearLeaveTimer()
        pointerInside.current = false
    }, [clearLeaveTimer])

    // A getter, not the ref: a hook result that carries a ref cannot be read during render.
    const isPointerInside = useCallback(() => pointerInside.current, [])

    return { onPointerEnter, onPointerLeave, reset, isPointerInside }
}

/**
 * Moves focus into the card without scrolling, since the first pass runs before the popover is positioned.
 * A second pass on the next frame outlasts Lexical re-applying its selection after the opening click.
 */
export function useFocusOnOpen(target: RefObject<HTMLElement | null>, enabled = true) {
    useEffect(() => {
        if (!enabled) return

        const focusTarget = () => target.current?.focus({ preventScroll: true })

        focusTarget()
        const frame = requestAnimationFrame(focusTarget)

        return () => cancelAnimationFrame(frame)
    }, [target, enabled])
}

/**
 * Escape acts on the card wherever focus sits: on one of its actions, or back on the link. A
 * native listener on the document is what makes that reliable. A React handler on the dropdown
 * never sees a key pressed on an action inside it, and stopping the event here also keeps it from
 * reaching an editor field, where EscapeFocusPlugin would blur the whole editor.
 */
export function useEscapeOnCard(isOpen: boolean, onEscape: () => void) {
    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            onEscape()
        }

        document.addEventListener('keydown', handleEscape, true)

        return () => document.removeEventListener('keydown', handleEscape, true)
    }, [isOpen, onEscape])
}

type OpenLinkCard = { close: () => void; dropdownId: string }

let openCard: OpenLinkCard | null = null

/**
 * One link card at a time across the page, so opening one elsewhere closes this one. `close` has to
 * keep a stable identity.
 */
export function useExclusiveLinkCard(close: () => void, dropdownId: string) {
    const release = useCallback(() => {
        if (openCard?.close === close) openCard = null
    }, [close])

    const claim = useCallback(() => {
        if (openCard && openCard.close !== close) openCard.close()
        openCard = { close, dropdownId }
    }, [close, dropdownId])

    // A card holding focus is in use, an edit form with unsaved changes above all, so a passing
    // pointer must not take it over.
    const isAnotherCardFocused = useCallback(() => {
        if (!openCard || openCard.close === close) return false
        return Boolean(document.getElementById(openCard.dropdownId)?.contains(document.activeElement))
    }, [close])

    useEffect(() => release, [release])

    return { claim, isAnotherCardFocused }
}
