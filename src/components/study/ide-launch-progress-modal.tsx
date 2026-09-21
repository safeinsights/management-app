'use client'

import type { FC } from 'react'
import { Progress, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { useTimedProgress } from '@/hooks/use-timed-progress'
import { LAUNCH_STEPS } from './launch-progress'
import { fontWeight, semanticColor } from '@/theme/tokens'

const MODAL_TITLE = 'Setting up the SafeInsights IDE'
const HEADING = 'Launching the IDE in a new tab'

const SECONDS_PER_MINUTE = 60

/** Rounded up and floored at one: "Ready in 0 minutes" would read as finished when it is not. */
const minutesRemaining = (secondsRemaining: number) => Math.max(1, Math.ceil(secondsRemaining / SECONDS_PER_MINUTE))

type IdeLaunchProgressModalProps = {
    isOpen: boolean
    /** Dismissing abandons the launch, per the card — the IDE must not open afterwards. */
    onAbandon: () => void
    dataPartnerName: string
    buildLog: string
    agentLog: string
}

/**
 * Reuses LAUNCH_STEPS, whose estimates are keyed off markers in the build and agent logs, so the
 * bar and the countdown track real provisioning rather than a fixed timer.
 */
export const IdeLaunchProgressModal: FC<IdeLaunchProgressModalProps> = ({
    isOpen,
    onAbandon,
    dataPartnerName,
    buildLog,
    agentLog,
}) => {
    const { value, secondsRemaining } = useTimedProgress(LAUNCH_STEPS, { buildLog, agentLog }, isOpen)

    return (
        <AppModal isOpen={isOpen} onClose={onAbandon} title={MODAL_TITLE} closeButtonProps={{ 'aria-label': 'Close' }}>
            <Stack gap="lg">
                <Stack gap="xxs">
                    <Text fw={fontWeight.bold}>{HEADING}</Text>
                    <Text size="sm" c={semanticColor('text.secondary')}>
                        Ready in {minutesRemaining(secondsRemaining)} minutes
                    </Text>
                </Stack>
                {/* value is a 0-1 fraction; Mantine's Progress wants a percentage. */}
                <Progress value={value * 100} size="sm" aria-label="Launch progress" />
                <Text size="sm">
                    The IDE opens in a new tab. Write and test your code there. Your files sync back to SafeInsights
                    automatically, so you do not need to keep this page open. When you are ready,{' '}
                    <Text span inherit fw={fontWeight.bold}>
                        return here to submit your code
                    </Text>{' '}
                    to {dataPartnerName} for review.
                </Text>
            </Stack>
        </AppModal>
    )
}
