import { type ReactNode } from 'react'
import { Progress, Stack, Text } from '@mantine/core'
import { formatRelativeTime } from '@/lib/relative-time'
import { useTimedProgress, type TimedStep } from '@/hooks/use-timed-progress'
import { useSpyMode } from './spy-mode-context'

// Kept out of the render body, which must stay pure, so the Date.now() read isn't flagged.
function isFuture(date: Date): boolean {
    return date.getTime() > Date.now()
}

function RelativeTime({ date }: { date: Date }) {
    const iso = date.toISOString()
    return (
        <time dateTime={iso} title={iso}>
            {formatRelativeTime(date)}
        </time>
    )
}

interface TimedProgressBarProps<T> {
    isVisible: boolean
    steps: TimedStep<T>[]
    /** Matched against each step's predicate. */
    data: T
    lastUpdatedAt?: Date | null
    label?: string
    /** Collapsible detail (e.g. logs) revealed by clicking the caption. */
    children?: ReactNode
}

export function TimedProgressBar<T>({
    isVisible,
    steps,
    data,
    lastUpdatedAt,
    label = 'Progress',
    children,
}: TimedProgressBarProps<T>) {
    const { value, secondsRemaining } = useTimedProgress(steps, data, isVisible)
    const { isSpyMode } = useSpyMode()

    if (!isVisible) return null

    const readyEstimate = lastUpdatedAt ? new Date(lastUpdatedAt.getTime() + secondsRemaining * 1000) : null

    let caption: ReactNode = null
    if (lastUpdatedAt && readyEstimate && isFuture(readyEstimate)) {
        caption = (
            <>
                Ready <RelativeTime date={readyEstimate} /> · updated <RelativeTime date={lastUpdatedAt} />
            </>
        )
    } else if (lastUpdatedAt) {
        caption = (
            <>
                Updated <RelativeTime date={lastUpdatedAt} />
            </>
        )
    }

    const details =
        isSpyMode && children ? (
            <details>
                <summary style={{ cursor: 'pointer' }}>
                    <Text span size="xs" c="dimmed">
                        {caption ?? label}
                    </Text>
                </summary>
                <Stack gap={4} mt={4}>
                    {children}
                </Stack>
            </details>
        ) : (
            <Text size="xs" c="dimmed">
                {caption}
            </Text>
        )

    return (
        <Stack gap={2}>
            {/* value is a 0–1 fraction; Mantine's Progress expects a 0–100 percentage */}
            <Progress value={value * 100} size="lg" striped animated aria-label={label} />
            {details}
        </Stack>
    )
}
