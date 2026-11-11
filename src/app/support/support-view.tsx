'use client'

import type { FC } from '@/common'
import { PageHeader } from '@/components/page-header'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { ActionIcon, CopyButton, Group, Paper, Stack, Text } from '@mantine/core'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr'

export const SUPPORT_EMAIL = 'beta-team@safeinsights.org'

const ICON_SIZE = 16
const COPIED_MS = 2000

const CopiedLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <Text component="span" fz="sm" ml="xs" c={semanticColor('success.text')}>
            Copied
        </Text>
    )
}

// Plain text on purpose: the card rules out a mailto: link.
// The address may break only after the @; the domain, period, icon and "Copied" stay one unbreakable
// run. An inline-flex is itself a break opportunity, so the nowrap wrapper leaves the <wbr> as the only one.
const [localPart, domain] = SUPPORT_EMAIL.split('@')

const CopyEmail: FC<{ copied: boolean; copy: () => void }> = ({ copied, copy }) => (
    <Text>
        Have a question or running into a blocker?
        <br />
        Please don’t hesitate to email SafeInsights at{' '}
        <span className="nowrap">
            <Text component="span" fw={fontWeight.semibold}>
                {localPart}@
            </Text>
            <wbr />
            <Group component="span" display="inline-flex" gap={0} wrap="nowrap" align="center">
                <Text component="span" fw={fontWeight.semibold}>
                    {domain}
                </Text>
                .
                <ActionIcon
                    variant="subtle"
                    size="xs"
                    ml="xs"
                    c={semanticColor('icon.dark')}
                    aria-label="Copy email address"
                    onClick={copy}
                >
                    {copied ? <CheckIcon size={ICON_SIZE} /> : <CopyIcon size={ICON_SIZE} />}
                </ActionIcon>
                <span role="status">
                    <CopiedLabel isVisible={copied} />
                </span>
            </Group>
        </span>
    </Text>
)

export const SupportView: FC = () => (
    <Stack p="xxl" gap="xxl">
        <PageHeader title="Support" />
        <Paper shadow="xs" p="xxl">
            <CopyButton value={SUPPORT_EMAIL} timeout={COPIED_MS}>
                {({ copied, copy }) => <CopyEmail copied={copied} copy={copy} />}
            </CopyButton>
        </Paper>
    </Stack>
)
