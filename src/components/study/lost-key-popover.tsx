'use client'

import { Anchor, Group, Popover, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { useRef } from 'react'
import { Routes } from '@/lib/routes'

export const LostKeyPopover = () => {
    const [opened, { toggle, close }] = useDisclosure(false)
    const triggerRef = useRef<SVGSVGElement>(null)

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
                    <InfoIcon
                        ref={triggerRef}
                        size={16}
                        weight="fill"
                        color="var(--mantine-color-charcoal-4)"
                        onClick={toggle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggle()
                            }
                            if (e.key === 'Escape' && opened) {
                                e.stopPropagation()
                                closeAndRestoreFocus()
                            }
                        }}
                        role="button"
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        aria-label="Lost your key? Click for help"
                    />
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
                        <Anchor
                            href={Routes.userKey}
                            target="_blank"
                            rel="noopener noreferrer"
                            fz={14}
                            aria-label="Manage your security key (opens in a new tab)"
                            c="blue.7"
                        >
                            Manage your security key
                        </Anchor>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        </Group>
    )
}
