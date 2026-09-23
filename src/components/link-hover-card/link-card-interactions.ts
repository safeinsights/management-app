'use client'

import { useCallback, useEffect, type RefObject } from 'react'
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

export function openLinkInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Moves focus into the card as it opens, in two passes. In an editor, Lexical re-applies the DOM
 * selection right after the click that opened the card, which pulls focus back to the field, so a
 * single pass on mount does not hold. The second pass lands after it; elsewhere it is a no-op.
 */
export function useFocusOnOpen(target: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const focusTarget = () => target.current?.focus()

        focusTarget()
        const frame = requestAnimationFrame(focusTarget)

        return () => cancelAnimationFrame(frame)
    }, [target])
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

let closeOpenCard: (() => void) | null = null

/**
 * One link card at a time across the page, so opening one elsewhere closes this one. `close` has to
 * keep a stable identity.
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
