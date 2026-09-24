'use client'

import {
    useCallback,
    useId,
    useRef,
    useState,
    type FocusEvent,
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

    useEscapeOnCard(opened, closeAndReturnFocus)

    // Focus moving anywhere but the link or its card closes it. With no next target, the press
    // landed on nothing focusable, which the outside click handles, or on the link in Safari.
    const onBlur = (event: FocusEvent<HTMLElement>) => {
        const next = event.relatedTarget
        if (!(next instanceof Node)) return
        if (next === triggerRef.current || document.getElementById(dropdownId)?.contains(next)) return
        close()
    }

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

    // Named only while open, so the fading card adds nothing to a label that contains the link.
    const dialogAria = opened ? ({ role: 'dialog', 'aria-label': LINK_CARD_DIALOG_LABEL } as const) : {}

    return { opened, dropdownId, triggerAria, dialogAria, close, onBlur, onClick, onKeyDown }
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
                    onClick={card.onClick}
                    onKeyDown={card.onKeyDown}
                    onBlur={card.onBlur}
                >
                    {children}
                </LinkWithIcon>
            </Popover.Target>
            <Popover.Dropdown id={card.dropdownId} {...card.dialogAria} p="sm" onBlur={card.onBlur}>
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
