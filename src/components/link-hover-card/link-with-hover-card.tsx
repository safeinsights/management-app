'use client'

import { useCallback, useId, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { Popover } from '@mantine/core'
import { LinkWithIcon, type LinkWithIconProps } from '@/components/links'
import { LINK_CARD_DIALOG_LABEL } from './copy'
import {
    LINK_CARD_POPOVER_PROPS,
    useEscapeOnCard,
    useExclusiveLinkCard,
    useHoverIntent,
} from './link-card-interactions'
import { absoluteHref, currentOrigin } from './link-preview'
import { ReadOnlyLinkCardBody } from './read-only-link-card'

function useLinkWithHoverCard() {
    const [opened, setOpened] = useState(false)
    const triggerRef = useRef<HTMLAnchorElement | null>(null)
    // Keeps the link's focus handler from reopening the card that Escape just closed.
    const isRestoringFocus = useRef(false)
    const dropdownId = useId()

    const close = useCallback(() => setOpened(false), [])
    const { claim } = useExclusiveLinkCard(close)

    const open = useCallback(() => {
        claim()
        setOpened(true)
    }, [claim])

    const isInsideCard = useCallback(
        (node: Node | null) =>
            node === triggerRef.current || Boolean(document.getElementById(dropdownId)?.contains(node)),
        [dropdownId],
    )

    // Focus on the link or in the card keeps it open, as a click in the card pins it.
    const closeUnlessFocused = useCallback(() => {
        if (!isInsideCard(document.activeElement)) close()
    }, [isInsideCard, close])

    const hover = useHoverIntent({ onEnter: open, onLeave: closeUnlessFocused })
    const { cancel: cancelHover, isPointerInside } = hover

    const closeOnEscape = useCallback(() => {
        cancelHover()
        const hadFocus = isInsideCard(document.activeElement)
        close()
        if (!hadFocus) return
        isRestoringFocus.current = true
        // focus() dispatches synchronously, so the flag is still set when onTriggerFocus reads it.
        triggerRef.current?.focus()
        isRestoringFocus.current = false
    }, [cancelHover, isInsideCard, close])

    useEscapeOnCard(opened, closeOnEscape)

    const onTriggerPointerEnter = (event: PointerEvent<HTMLAnchorElement>) => {
        triggerRef.current = event.currentTarget
        hover.onPointerEnter(event)
    }

    // Keyboard focus only: a mouse press, or the window regaining focus after the link opened a new
    // tab, also focuses the link and must not reopen the card.
    const onTriggerFocus = (event: FocusEvent<HTMLAnchorElement>) => {
        triggerRef.current = event.currentTarget
        if (isRestoringFocus.current || !event.currentTarget.matches(':focus-visible')) return
        open()
    }

    // The browser follows the link into a new tab, so the card has done its job here.
    const onTriggerClick = () => {
        cancelHover()
        close()
    }

    // Focus moving anywhere but the link or its card closes it, unless the pointer still rests on
    // either. With no next target, the press landed on nothing focusable, which the outside click handles.
    const onBlur = (event: FocusEvent<HTMLElement>) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || isInsideCard(next) || isPointerInside()) return
        close()
    }

    const triggerAria = {
        'aria-haspopup': 'dialog',
        'aria-expanded': opened,
        'aria-controls': opened ? dropdownId : undefined,
    } as const

    // Named only while open, so the fading card adds nothing to a label that contains the link.
    const dialogAria = opened ? ({ role: 'dialog', 'aria-label': LINK_CARD_DIALOG_LABEL } as const) : {}

    return {
        opened,
        dropdownId,
        triggerAria,
        dialogAria,
        close,
        onBlur,
        onTriggerClick,
        onTriggerFocus,
        onTriggerPointerEnter,
        onPointerEnter: hover.onPointerEnter,
        onPointerLeave: hover.onPointerLeave,
    }
}

type LinkWithHoverCardProps = LinkWithIconProps & { href: string }

/**
 * A plain link that shows the link card on hover or keyboard focus and follows the link on click or
 * Enter. The destination always opens in a new tab, so the SafeInsights tab never unloads (OTTER-463).
 */
export function LinkWithHoverCard({ href, children, ...linkProps }: LinkWithHoverCardProps) {
    const card = useLinkWithHoverCard()

    return (
        <Popover
            {...LINK_CARD_POPOVER_PROPS}
            opened={card.opened}
            // The card already scrolls away with its link. The detached check would only hide it with
            // display: none, dropping focus from Copy link, and it misfires wherever layout is unmeasured.
            hideDetached={false}
            closeOnEscape={false}
            // Mantine would name the card after the link text; it is "Link details" everywhere.
            withRoles={false}
            // Rendered right after the link, so Tab moves between the link, the card and the rest of the
            // page in the browser's own order. Fixed positioning stops an ancestor clipping it.
            withinPortal={false}
            floatingStrategy="fixed"
            onDismiss={card.close}
        >
            <Popover.Target>
                <LinkWithIcon
                    {...linkProps}
                    {...card.triggerAria}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={card.onTriggerClick}
                    onFocus={card.onTriggerFocus}
                    onBlur={card.onBlur}
                    onPointerEnter={card.onTriggerPointerEnter}
                    onPointerLeave={card.onPointerLeave}
                >
                    {children}
                </LinkWithIcon>
            </Popover.Target>
            <Popover.Dropdown
                id={card.dropdownId}
                {...card.dialogAria}
                p="sm"
                onBlur={card.onBlur}
                onPointerEnter={card.onPointerEnter}
                onPointerLeave={card.onPointerLeave}
            >
                <LinkCardContent isVisible={card.opened} href={href} />
            </Popover.Dropdown>
        </Popover>
    )
}

function LinkCardContent({ isVisible, href }: { isVisible: boolean; href: string }) {
    if (!isVisible) return null

    const url = absoluteHref(href, currentOrigin())

    return <ReadOnlyLinkCardBody url={url} opensInNewTab moveFocusOnOpen={false} />
}
