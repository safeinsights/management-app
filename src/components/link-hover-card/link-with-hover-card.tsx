'use client'

import {
    useCallback,
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
    LINK_CARD_POPOVER_PROPS,
    openLinkInNewTab,
    useEscapeOnCard,
    useExclusiveLinkCard,
    useFocusOnOpen,
} from './link-card-interactions'
import { LinkHoverCard } from './link-hover-card'
import { absoluteHref, currentOrigin } from './link-preview'
import { useLinkPreview } from './use-link-preview'

const OPEN_KEYS = ['Enter', ' ']
const PRIMARY_BUTTON = 0

// Any modifier asks the browser for a new tab, a new window or the context menu, not for the card.
const wantsBrowserDefault = (event: ReactMouseEvent) =>
    event.button !== PRIMARY_BUTTON || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

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

    const open = (trigger: HTMLAnchorElement) => {
        claim()
        triggerRef.current = trigger
        setOpened(true)
    }

    const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
        if (wantsBrowserDefault(event)) return
        event.preventDefault()
        open(event.currentTarget)
    }

    // Enter would follow the link and Space would scroll the page.
    const onKeyDown = (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
        if (!OPEN_KEYS.includes(event.key)) return
        event.preventDefault()
        open(event.currentTarget)
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

    return <LinkCardBody href={href} />
}

function LinkCardBody({ href }: { href: string }) {
    const firstActionRef = useRef<HTMLButtonElement>(null)

    useFocusOnOpen(firstActionRef)

    const url = absoluteHref(href, currentOrigin())
    const preview = useLinkPreview(url)
    const openInNewTab = () => openLinkInNewTab(url)

    return (
        <LinkHoverCard
            preview={preview}
            mode="readOnly"
            opensInNewTab
            firstActionRef={firstActionRef}
            onOpenInNewTab={openInNewTab}
        />
    )
}
