'use client'

import type { FC } from 'react'
import { Button, Progress, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'

const MODAL_TITLE = 'Setting up the SafeInsights IDE'
const HEADING = 'IDE failed to launch'

/**
 * The design's literal placeholder. Left as-is because what fills it is still being settled with
 * the team; `reportError` already mints a Sentry event id for the same failure, so this is likely
 * a plumbing change rather than a new scheme. MUST NOT reach users as x's.
 */
const SUPPORT_REF_PLACEHOLDER = 'xxxxxxxxxx'

const supportLine = (supportRef: string) =>
    `If the issue persists, contact SafeInsights support with Ref: ${supportRef}.`

type IdeLaunchFailedModalProps = {
    isOpen: boolean
    onClose: () => void
    onRetry: () => void
    supportRef?: string
}

/**
 * Replaces the launch progress modal when a launch fails (OTTER-693 row 7). Shares that modal's
 * title and its full-width bar, turned red — the design treats the two as one surface in two
 * states rather than as separate dialogs.
 */
export const IdeLaunchFailedModal: FC<IdeLaunchFailedModalProps> = ({
    isOpen,
    onClose,
    onRetry,
    supportRef = SUPPORT_REF_PLACEHOLDER,
}) => (
    <AppModal isOpen={isOpen} onClose={onClose} title={MODAL_TITLE} closeButtonProps={{ 'aria-label': 'Close' }}>
        <Stack gap="lg">
            <Stack gap={4}>
                <Text fw={700} c="red.7">
                    {HEADING}
                </Text>
                <Text size="sm">{supportLine(supportRef)}</Text>
            </Stack>
            {/* Full rather than a partial value: the bar reads as a failed run, not as progress. */}
            <Progress value={100} color="red.7" size="sm" aria-label="Launch failed" />
            <Button onClick={onRetry}>Try again</Button>
        </Stack>
    </AppModal>
)
