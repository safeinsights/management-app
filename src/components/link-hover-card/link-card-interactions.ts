'use client'

import { useCallback, useEffect, useSyncExternalStore, type RefObject } from 'react'
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
const hasModifier = (event: ModifierKeys) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

export const wantsBrowserDefault = (event: ModifierKeys & { button: number }) =>
    event.button !== PRIMARY_BUTTON || hasModifier(event)

export function openLinkInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
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

let openCardCount = 0
const openCardListeners = new Set<() => void>()

function changeOpenCardCount(delta: number) {
    openCardCount += delta
    openCardListeners.forEach((listener) => listener())
}

function subscribeToOpenCards(listener: () => void) {
    openCardListeners.add(listener)
    return () => {
        openCardListeners.delete(listener)
    }
}

const isAnyLinkCardOpen = () => openCardCount > 0

/**
 * Mantine's Modal hears Escape on window, ahead of the card's document listener, so a modal
 * hosting a card has to leave the first Escape to it (OTTER-792).
 */
export function useIsLinkCardOpen() {
    return useSyncExternalStore(subscribeToOpenCards, isAnyLinkCardOpen, () => false)
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
        changeOpenCardCount(1)

        return () => {
            document.removeEventListener('keydown', handleEscape, true)
            changeOpenCardCount(-1)
        }
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
