'use client'

import type { FC } from 'react'
import { Button, Progress, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { fontWeight, semanticColor } from '@/theme/tokens'

const MODAL_TITLE = 'Setting up the SafeInsights IDE'
const HEADING = 'IDE failed to launch'

// Dropped rather than faked when absent: the modal paints once before the id lands.
const supportLine = (supportRef: string | null) =>
    supportRef
        ? `If the issue persists, contact SafeInsights support with Ref: ${supportRef}.`
        : 'If the issue persists, contact SafeInsights support.'

type IdeLaunchFailedModalProps = {
    isOpen: boolean
    onClose: () => void
    onRetry: () => void
    /** The Sentry event id `reportError` minted for this failure, or null before it lands. */
    supportRef?: string | null
}

/**
 * Shares the progress modal's title and full-width bar, turned red: the design treats the two as
 * one surface in two states rather than as separate dialogs.
 */
export const IdeLaunchFailedModal: FC<IdeLaunchFailedModalProps> = ({
    isOpen,
    onClose,
    onRetry,
    supportRef = null,
}) => (
    <AppModal isOpen={isOpen} onClose={onClose} title={MODAL_TITLE} closeButtonProps={{ 'aria-label': 'Close' }}>
        <Stack gap="lg">
            <Stack gap="xxs">
                <Text fw={fontWeight.bold} c={semanticColor('error.text')}>
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
