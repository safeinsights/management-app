'use client'

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react'
import { Popover } from '@mantine/core'
import { LinkWithIcon, type LinkWithIconProps } from '@/components/links'
import { LINK_CARD_DIALOG_LABEL } from './copy'
import {
    hasModifier,
    LINK_CARD_POPOVER_PROPS,
    OPEN_KEYS,
    useEscapeOnCard,
    useExclusiveLinkCard,
    wantsBrowserDefault,
} from './link-card-interactions'
import { absoluteHref, currentOrigin } from './link-preview'
import { ReadOnlyLinkCardBody } from './read-only-link-card'
import { focusNextTabStopAfter, tabStopsIn } from './tab-stops'

type TabDirection = 'forward' | 'back'

/**
 * The card is portaled to the end of the page, so Tab past its edge would skip the rest of the
 * form. Leaving it closes the card and continues from the link, as if the card sat right after it.
 */
function useTabOutOfCard(isOpen: boolean, dropdownId: string, onLeave: (direction: TabDirection) => void) {
    useEffect(() => {
        if (!isOpen) return

        const handleTab = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return

            const card = document.getElementById(dropdownId)
            if (!card || !(event.target instanceof Node) || !card.contains(event.target)) return

            const stops = tabStopsIn(card)
            const direction: TabDirection = event.shiftKey ? 'back' : 'forward'
            const edge = direction === 'forward' ? stops.at(-1) : stops[0]
            if (event.target !== edge) return

            event.preventDefault()
            onLeave(direction)
        }

        document.addEventListener('keydown', handleTab, true)

        return () => document.removeEventListener('keydown', handleTab, true)
    }, [isOpen, dropdownId, onLeave])
}

function useLinkWithHoverCard() {
    const [opened, setOpened] = useState(false)
    const triggerRef = useRef<HTMLAnchorElement | null>(null)
    const dropdownId = useId()

    const close = useCallback(() => setOpened(false), [])
    const { claim } = useExclusiveLinkCard(close)

    const closeAndReturnFocus = useCallback(() => {
        close()
        triggerRef.current?.focus()
    }, [close])

    const leaveCard = useCallback(
        (direction: TabDirection) => {
            const card = document.getElementById(dropdownId)
            const trigger = triggerRef.current
            close()
            if (!trigger) return
            if (direction === 'forward' && card && focusNextTabStopAfter(trigger, card)) return
            trigger.focus()
        },
        [close, dropdownId],
    )

    useEscapeOnCard(opened, closeAndReturnFocus)
    useTabOutOfCard(opened, dropdownId, leaveCard)

    const toggle = (trigger: HTMLAnchorElement) => {
        if (opened) {
            close()
            return
        }
        claim()
        triggerRef.current = trigger
        setOpened(true)
    }

    const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
        if (wantsBrowserDefault(event)) return
        event.preventDefault()
        toggle(event.currentTarget)
    }

    const onKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
        if (!OPEN_KEYS.includes(event.key) || hasModifier(event)) return
        event.preventDefault()
        toggle(event.currentTarget)
    }

    const triggerAria = {
        'aria-haspopup': 'dialog',
        'aria-expanded': opened,
        'aria-controls': opened ? dropdownId : undefined,
    } as const

    return { opened, dropdownId, triggerAria, close, onClick, onKeyDown }
}

type LinkWithHoverCardProps = LinkWithIconProps & { href: string }

/**
 * A plain link that opens the link card on click instead of navigating. The destination always
 * opens in a new tab, so the SafeInsights tab never unloads (OTTER-463).
 */
export function LinkWithHoverCard({ href, children, ...linkProps }: LinkWithHoverCardProps) {
    const card = useLinkWithHoverCard()

    return (
        <Popover
            {...LINK_CARD_POPOVER_PROPS}
            opened={card.opened}
            // As in the editor cards. Mantine's detached check hides the card wherever layout is not
            // measured, the unit tests included.
            hideDetached={false}
            closeOnEscape={false}
            // Mantine would name the card after the link text; it is "Link details" everywhere.
            withRoles={false}
            onDismiss={card.close}
        >
            <Popover.Target>
                <LinkWithIcon
                    {...linkProps}
                    {...card.triggerAria}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={card.onClick}
                    onKeyDown={card.onKeyDown}
                >
                    {children}
                </LinkWithIcon>
            </Popover.Target>
            <Popover.Dropdown id={card.dropdownId} role="dialog" aria-label={LINK_CARD_DIALOG_LABEL} p="sm">
                <LinkCardContent isVisible={card.opened} href={href} />
            </Popover.Dropdown>
        </Popover>
    )
}

function LinkCardContent({ isVisible, href }: { isVisible: boolean; href: string }) {
    if (!isVisible) return null

    const url = absoluteHref(href, currentOrigin())

    return <ReadOnlyLinkCardBody url={url} opensInNewTab />
}
