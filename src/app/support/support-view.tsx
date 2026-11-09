'use client'

import type { FC } from '@/common'
import { PageHeader } from '@/components/page-header'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { ActionIcon, Box, CopyButton, Group, Paper, Stack, Text } from '@mantine/core'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr'

export const SUPPORT_EMAIL = 'beta-team@safeinsights.org'

const ICON_SIZE = 20
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
// Below xs the address may break after the @; the domain, icon and period stay one unbreakable run so
// the icon always sits beside the address (OTTER-934 QA). An inline-flex is itself a break
// opportunity, so the nowrap wrapper leaves the <wbr> as the only one.
const [localPart, domain] = SUPPORT_EMAIL.split('@')

const CopyEmail: FC<{ copied: boolean; copy: () => void }> = ({ copied, copy }) => (
    <Text>
        Have a question or running into a blocker? Please don’t hesitate to email SafeInsights at{' '}
        <span className="nowrap">
            <Text component="span" fw={fontWeight.semibold}>
                {localPart}@
            </Text>
            <Box component="wbr" hiddenFrom="xs" />
            <Group component="span" display="inline-flex" gap={0} wrap="nowrap" align="center">
                <Text component="span" fw={fontWeight.semibold}>
                    {domain}
                </Text>
                <ActionIcon
                    variant="subtle"
                    size={ICON_SIZE}
                    ml="xs"
                    c={semanticColor('icon.dark')}
                    aria-label="Copy email address"
                    onClick={copy}
                >
                    {copied ? <CheckIcon size={ICON_SIZE} /> : <CopyIcon size={ICON_SIZE} />}
                </ActionIcon>
                .
            </Group>
        </span>
        <span role="status">
            <CopiedLabel isVisible={copied} />
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
