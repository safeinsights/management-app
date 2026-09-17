'use client'

import { ActionIcon, Group, Popover, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { ArrowSquareOutIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { useRef } from 'react'
import { LinkWithIcon } from '@/components/links'
import { Routes } from '@/lib/routes'

export const LostKeyPopover = () => {
    const [opened, { toggle, close }] = useDisclosure(false)
    const triggerRef = useRef<HTMLButtonElement>(null)

    const closeAndRestoreFocus = () => {
        close()
        triggerRef.current?.focus()
    }

    return (
        <Group gap={4} align="center">
            <Text fz={16} c="charcoal.7">
                Lost your key?
            </Text>
            <Popover opened={opened} onChange={close} width={360} position="right" withArrow>
                <Popover.Target>
                    <ActionIcon
                        ref={triggerRef}
                        variant="transparent"
                        color="charcoal.4"
                        size={20}
                        onClick={toggle}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape' && opened) {
                                e.stopPropagation()
                                closeAndRestoreFocus()
                            }
                        }}
                        aria-label="Lost your key? Click for help"
                    >
                        <InfoIcon size={16} weight="fill" />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.stopPropagation()
                            closeAndRestoreFocus()
                        }
                    }}
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
