'use client'

import { ActionIcon, Group, Popover, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { LinkWithIcon } from '@/components/links'
import { Routes } from '@/lib/routes'

// Long enough for the pointer to cross the gap between the icon and the card, short enough that the
// card does not linger once the pointer has really left. The card holds a link, so it has to stay
// reachable by pointer (WCAG 2.1 SC 1.4.13, content on hover must be hoverable).
const HOVER_CLOSE_DELAY_MS = 120

const useLostKeyPopover = () => {
    const [opened, setOpened] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Refs, not state: nothing renders from them, and the hover timer and the blur handler both
    // need the value at the moment they run rather than the one their closure captured.
    const isPinned = useRef(false)
    const isPointerInside = useRef(false)

    const cancelScheduledClose = useCallback(() => {
        if (closeTimer.current === null) return
        clearTimeout(closeTimer.current)
        closeTimer.current = null
    }, [])

    useEffect(() => cancelScheduledClose, [cancelScheduledClose])

    const open = useCallback(() => {
        cancelScheduledClose()
        setOpened(true)
    }, [cancelScheduledClose])

    const dismiss = useCallback(() => {
        cancelScheduledClose()
        isPinned.current = false
        setOpened(false)
    }, [cancelScheduledClose])

    const dismissAndRestoreFocus = useCallback(() => {
        dismiss()
        triggerRef.current?.focus()
    }, [dismiss])

    const onPointerEnter = useCallback(() => {
        isPointerInside.current = true
        open()
    }, [open])

    const onPointerLeave = useCallback(() => {
        isPointerInside.current = false
        if (isPinned.current) return
        cancelScheduledClose()
        closeTimer.current = setTimeout(() => {
            closeTimer.current = null
            setOpened(false)
        }, HOVER_CLOSE_DELAY_MS)
    }, [cancelScheduledClose])

    // A click pins the card so it survives the pointer leaving; hover alone leaves it unpinned.
    const onTriggerClick = useCallback(() => {
        if (isPinned.current) {
            dismiss()
            return
        }
        isPinned.current = true
        open()
    }, [dismiss, open])

    const onTriggerFocus = useCallback(() => open(), [open])

    // Tabbing away closes it, but a pointer already inside the card does not: the blur fires on the
    // mousedown that is on its way to the link, and closing here would swallow that click.
    const onTriggerBlur = useCallback(() => {
        if (isPinned.current || isPointerInside.current) return
        dismiss()
    }, [dismiss])

    const onEscape = useCallback(
        (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            dismissAndRestoreFocus()
        },
        [dismissAndRestoreFocus],
    )

    const onOpenedChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) dismiss()
        },
        [dismiss],
    )

    return {
        opened,
        triggerRef,
        onOpenedChange,
        onPointerEnter,
        onPointerLeave,
        onTriggerClick,
        onTriggerFocus,
        onTriggerBlur,
        onEscape,
    }
}

export const LostKeyPopover = () => {
    const popover = useLostKeyPopover()

    return (
        <Group gap={4} align="center">
            <Text fz={16} c="charcoal.7">
                Lost your key?
            </Text>
            <Popover
                opened={popover.opened}
                onChange={popover.onOpenedChange}
                width={360}
                position="right"
                shadow="md"
                radius="md"
                withArrow
            >
                <Popover.Target>
                    <ActionIcon
                        ref={popover.triggerRef}
                        variant="transparent"
                        color="charcoal.4"
                        size={20}
                        onClick={popover.onTriggerClick}
                        onFocus={popover.onTriggerFocus}
                        onBlur={popover.onTriggerBlur}
                        onMouseEnter={popover.onPointerEnter}
                        onMouseLeave={popover.onPointerLeave}
                        onKeyDown={popover.onEscape}
                        aria-label="Lost your key? Click for help"
                    >
                        <InfoIcon size={16} weight="fill" />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown
                    onMouseEnter={popover.onPointerEnter}
                    onMouseLeave={popover.onPointerLeave}
                    onKeyDown={popover.onEscape}
                >
                    <Stack gap="sm">
                        <Text fz={14}>
                            Another member of your organization can access these outputs with their own valid key. Ask
                            them to access them.
                        </Text>
                        <Text fz={14}>
                            A key you generate now cannot access these outputs. It applies only to outputs encrypted
                            after you generate it.
                        </Text>
                        {/* Decorative: the aria-label already announces the new tab, which is what
                            the design asks for rather than an icon-only cue. */}
                        <LinkWithIcon
                            href={Routes.userKey}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Manage your security key (opens in a new tab)"
                            icon={<ArrowSquareOutIcon size={16} aria-hidden="true" />}
                        >
                            Manage your security key
                        </LinkWithIcon>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        </Group>
    )
}
