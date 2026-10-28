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
        <Text component="span" fz="sm" c={semanticColor('success.text')}>
            Copied
        </Text>
    )
}

// Plain text on purpose: the card rules out a mailto: link.
const CopyEmail: FC<{ copied: boolean; copy: () => void }> = ({ copied, copy }) => (
    <Group gap="sm" wrap="nowrap" role="status">
        <Text fw={fontWeight.semibold}>{SUPPORT_EMAIL}</Text>
        <ActionIcon
            variant="subtle"
            size="sm"
            c={semanticColor('icon.dark')}
            aria-label="Copy email address"
            onClick={copy}
        >
            {copied ? <CheckIcon size={ICON_SIZE} /> : <CopyIcon size={ICON_SIZE} />}
        </ActionIcon>
        <CopiedLabel isVisible={copied} />
    </Group>
)

export const SupportView: FC = () => (
    <Stack p="xxl" gap="xxl">
        <PageHeader title="Support" />
        <Paper shadow="xs" p="xxl">
            <Stack gap="md">
                <Text>Have a question or running into a problem? Email us and we’ll get back to you.</Text>
                <CopyButton value={SUPPORT_EMAIL} timeout={COPIED_MS}>
                    {({ copied, copy }) => <CopyEmail copied={copied} copy={copy} />}
                </CopyButton>
            </Stack>
        </Paper>
    </Stack>
)
