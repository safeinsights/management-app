'use client'

import { ActionIcon, Group, Popover, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from 'react'
import { LinkWithIcon } from '@/components/links'
import { Routes } from '@/lib/routes'

// Long enough for the pointer to cross the gap between the icon and the card, short enough that the
// card does not linger once the pointer has really left. The card holds a link, so it has to stay
// reachable by pointer (WCAG 2.1 SC 1.4.13, content on hover must be hoverable).
const HOVER_CLOSE_DELAY_MS = 120

// The trigger ref is passed in rather than returned: a hook result that carries a ref may not be
// read during render, and every handler below is read exactly there.
const useLostKeyPopover = (triggerRef: RefObject<HTMLButtonElement | null>) => {
    const [opened, setOpened] = useState(false)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Refs, not state: nothing renders from them, and the hover timer and the blur handler both
    // need the value at the moment they run rather than the one their closure captured.
    const isPinned = useRef(false)
    const isPointerInside = useRef(false)
    // Set while a dismissal hands focus back to the icon, so the icon's own focus handler does not
    // reopen the card that dismissal just closed.
    const isRestoringFocus = useRef(false)

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
        isRestoringFocus.current = true
        // focus() dispatches synchronously, so the flag is still set when onTriggerFocus reads it.
        triggerRef.current?.focus()
        isRestoringFocus.current = false
    }, [dismiss, triggerRef])

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

    const onTriggerFocus = useCallback(() => {
        if (isRestoringFocus.current) return
        open()
    }, [open])

    // Watches the whole group rather than the icon, so Tab from the icon into the card's link is not
    // a dismissal. A pointer already inside does not dismiss either: the blur fires on the mousedown
    // that is on its way to the link, and closing here would swallow that click.
    const onGroupBlur = useCallback(
        (event: FocusEvent<HTMLDivElement>) => {
            if (isPinned.current || isPointerInside.current) return
            if (event.currentTarget.contains(event.relatedTarget)) return
            dismiss()
        },
        [dismiss],
    )

    // Guarded on `opened`: an unguarded stopPropagation swallowed Escape at the icon even with the
    // card closed, keeping it from reaching whatever surrounds this.
    const onEscape = useCallback(
        (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !opened) return
            event.stopPropagation()
            dismissAndRestoreFocus()
        },
        [opened, dismissAndRestoreFocus],
    )

    const onOpenedChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) dismiss()
        },
        [dismiss],
    )

    return {
        opened,
        onOpenedChange,
        onPointerEnter,
        onPointerLeave,
        onTriggerClick,
        onTriggerFocus,
        onGroupBlur,
        onEscape,
    }
}

export const LostKeyPopover = () => {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const popover = useLostKeyPopover(triggerRef)

    return (
        <Group gap={4} align="center" onBlur={popover.onGroupBlur}>
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
                // Keeps the card in this group's subtree so Tab from the icon reaches its link; a
                // portalled dropdown sits at the end of the body and is unreachable by keyboard.
                // Fixed positioning is what stops the inline card being clipped by an ancestor.
                withinPortal={false}
                floatingStrategy="fixed"
            >
                <Popover.Target>
                    <ActionIcon
                        ref={triggerRef}
                        variant="transparent"
                        color="charcoal.4"
                        size={20}
                        onClick={popover.onTriggerClick}
                        onFocus={popover.onTriggerFocus}
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
