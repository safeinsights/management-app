'use client'

import { Anchor, Button, Group, Paper, Popover, Stack, Text, Textarea } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { FormSectionHeader } from '@/components/study/form-section-header'

export function SecurityKeyForm() {
    return (
        <Paper p="xxl">
            <Stack gap="lg">
                <FormSectionHeader
                    title="Security key"
                    description="This key is required to access the outputs. It was issued to you during sign-up."
                    required
                />
                <Textarea
                    autoComplete="off"
                    aria-required
                    styles={{ input: { minHeight: 72, borderColor: 'var(--mantine-color-blue-7)' } }}
                    maw={800}
                />
                <div>
                    <Button size="sm">View</Button>
                </div>
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}

const LostKeyPopover = () => {
    const [opened, { toggle, close }] = useDisclosure(false)

    return (
        <Group gap={4} align="center">
            <Text fz={16} c="charcoal.7">
                Lost your key?
            </Text>
            <Popover opened={opened} onChange={close} width={360} position="right" withArrow>
                <Popover.Target>
                    <InfoIcon
                        size={16}
                        weight="fill"
                        color="var(--mantine-color-charcoal-4)"
                        onClick={toggle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggle()
                            }
                        }}
                        role="button"
                        tabIndex={0}
                        style={{ cursor: 'pointer' }}
                        aria-label="Lost your key? Click for help"
                    />
                </Popover.Target>
                <Popover.Dropdown>
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
                            aria-label="Manage your security key"
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
