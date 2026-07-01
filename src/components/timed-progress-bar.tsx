import { type ReactNode } from 'react'
import { Progress, Stack, Text } from '@mantine/core'
import { formatRelativeTime } from '@/lib/relative-time'
import { useTimedProgress, type TimedStep } from '@/hooks/use-timed-progress'

// Whether an instant is still ahead of now. Kept out of the render body (which must stay pure) so the
// Date.now() read isn't flagged; recomputed each render so an estimate can lapse as time passes.
function isFuture(date: Date): boolean {
    return date.getTime() > Date.now()
}

// Relative time (past or future) in a <time> element carrying the ISO timestamp — in dateTime and as
// the hover/alt text via title.
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
    // The data each step's predicate is matched against.
    data: T
    // When progress last advanced; drives the completion estimate and the "updated …" hint.
    lastUpdatedAt?: Date | null
    label?: string
    // Optional collapsible detail (e.g. logs) revealed by clicking the caption/summary.
    children?: ReactNode
}

// A progress bar driven by useTimedProgress: it fills toward each step's estimate (interpolating
// between updates) and shows the estimated time to completion (anchored to the last update, and
// dropped once that estimate lapses) plus how long since progress last updated. When given children,
// the caption becomes a <details> summary that reveals them. Returns null when not visible.
export function TimedProgressBar<T>({
    isVisible,
    steps,
    data,
    lastUpdatedAt,
    label = 'Progress',
    children,
}: TimedProgressBarProps<T>) {
    const { value, secondsRemaining } = useTimedProgress(steps, data, isVisible)

    if (!isVisible) return null

    // Anchor the estimate to the last activity. Once we blow past it (progress went quiet), drop the
    // estimate and just show how long since the last update.
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

    // With children, the caption is the summary of a <details> that reveals them; otherwise it's a
    // plain line.
    const details = children ? (
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
