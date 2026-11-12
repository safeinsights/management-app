'use client'

import type { FC } from '@/common'
import { PageHeader } from '@/components/page-header'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { ActionIcon, CopyButton, Group, Paper, Stack, Text, VisuallyHidden } from '@mantine/core'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr'

export const SUPPORT_EMAIL = 'beta-team@safeinsights.org'

const ICON_SIZE = 16
const COPIED_MS = 2000
const COPIED_LABEL = 'Copied'

// Hidden rather than unmounted: the label keeps its width, so copying never moves the line break.
// aria-hidden because the status region speaks instead: readers reliably announce added text, not revealed text.
const CopiedLabel: FC<{ isVisible: boolean }> = ({ isVisible }) => (
    <Text
        component="span"
        fz="sm"
        ml="xs"
        c={semanticColor('success.text')}
        className={isVisible ? undefined : 'invisible'}
        aria-hidden
    >
        {COPIED_LABEL}
    </Text>
)

// Plain text on purpose: the card rules out a mailto: link.
// The address may break only after the @; the domain, period, icon and "Copied" stay one unbreakable run.
// nowrap stops a break at beta-team's hyphen; the <wbr> sits outside it since Firefox and Safari ignore one inside.
const [localPart, domain] = SUPPORT_EMAIL.split('@')

const CopyEmail: FC<{ copied: boolean; copy: () => void }> = ({ copied, copy }) => (
    <Text>
        Have a question or running into a blocker?
        <br />
        Please don’t hesitate to email SafeInsights at{' '}
        <Text component="span" fw={fontWeight.semibold} className="nowrap">
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
            <CopiedLabel isVisible={copied} />
            <VisuallyHidden component="span" role="status" aria-live="polite">
                {copied ? COPIED_LABEL : ''}
            </VisuallyHidden>
        </Group>
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
