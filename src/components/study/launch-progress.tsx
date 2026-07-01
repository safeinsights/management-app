import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Progress, Stack, Text } from '@mantine/core'
import { formatRelativeTime } from '@/lib/relative-time'

interface LaunchStep {
    // Which accumulated log to search for the message.
    log: 'build' | 'agent'
    // Substring that marks this step's arrival in that log.
    message: string
    // Estimated seconds from this step until the next one (the last step, until the IDE is ready).
    secondsUntilNext: number
}

// Ordered launch milestones. Tune the estimates as real timings are observed.
export const LAUNCH_STEPS: LaunchStep[] = [
    { log: 'build', message: 'Initializing the backend...', secondsUntilNext: 2 },
    { log: 'build', message: 'data.aws_secretsmanager_secret.harbor_secret: Refreshing...', secondsUntilNext: 2 },
    { log: 'build', message: 'aws_ecs_service.workspace[0]: Plan to create', secondsUntilNext: 5 },
    { log: 'build', message: 'aws_ecs_task_definition.workspace[0]: Plan to create', secondsUntilNext: 70 },
    { log: 'agent', message: '+ mkdir -p ~/.cache/code-server', secondsUntilNext: 10 },
    { log: 'agent', message: 'Installing extensions...', secondsUntilNext: 20 },
]

const TOTAL_SECONDS = LAUNCH_STEPS.reduce((sum, step) => sum + step.secondsUntilNext, 0)

// Most recent non-empty line of a log, or '' if there is none.
function lastLogLine(log: string): string {
    const lines = log.split('\n').filter((line) => line.trim())
    return lines[lines.length - 1] ?? ''
}

// Index of the furthest milestone whose message has appeared in the logs, or -1 if none.
function furthestStepIndex(buildLog: string, agentLog: string): number {
    let furthest = -1
    LAUNCH_STEPS.forEach((step, index) => {
        const log = step.log === 'build' ? buildLog : agentLog
        if (log.includes(step.message)) furthest = index
    })
    return furthest
}

// Bar value (0–100) and estimated seconds remaining, from the furthest milestone seen in the logs.
// Time remaining is the sum of the estimates from that step onward; elapsed (the total minus that)
// drives the bar. Both are derived from the same estimates so they stay in sync.
export function launchProgress(buildLog: string, agentLog: string): { value: number; secondsRemaining: number } {
    const furthest = furthestStepIndex(buildLog, agentLog)
    const secondsRemaining = LAUNCH_STEPS.slice(Math.max(furthest, 0)).reduce(
        (sum, step) => sum + step.secondsUntilNext,
        0,
    )
    const value = Math.round(((TOTAL_SECONDS - secondsRemaining) / TOTAL_SECONDS) * 100)
    return { value, secondsRemaining }
}

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

interface LaunchProgressProps {
    isVisible: boolean
    buildLog: string
    agentLog: string
    lastUpdatedAt?: Date | null
}

// Milestone-driven launch progress bar with an estimated time remaining. Returns null when hidden.
export function LaunchProgress({ isVisible, buildLog, agentLog, lastUpdatedAt }: LaunchProgressProps) {
    const stepStartRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 })
    const [barValue, setBarValue] = useState(0)
    // Bumped each tick purely to re-render, so the relative "Ready in …" / "updated … ago" refresh
    // every second (not just on poll re-renders).
    const [, refreshRelativeTimes] = useState(0)

    // Log the newest log line with the current time so the real per-step durations can be inferred
    // from the timestamps — a tuning aid for the LAUNCH_STEPS estimates. Duplicates are fine. Prefers
    // the agent log once it has output, since the agent phase follows the build.
    useEffect(() => {
        if (!isVisible) return
        const line = lastLogLine(agentLog) || lastLogLine(buildLog)
        if (!line) return
        console.warn(`[launch] ${new Date().toISOString()} ${line}`)
    }, [isVisible, buildLog, agentLog])

    // Once a milestone is reached we know its estimated time to the next one, so between server polls
    // we creep the bar toward that next point on a 1s timer. Anchored to when the milestone was reached
    // (kept across log-only polls) and clamped so it never passes the next point or moves backwards.
    // All state updates happen in the timer callback (an external source) to keep the effect pure.
    useEffect(() => {
        if (!isVisible) return

        const tick = () => {
            const furthest = furthestStepIndex(buildLog, agentLog)
            const { value: base } = launchProgress(buildLog, agentLog)
            const stepSeconds =
                furthest >= 0 && furthest < LAUNCH_STEPS.length ? LAUNCH_STEPS[furthest].secondsUntilNext : 0
            const next = base + (stepSeconds / TOTAL_SECONDS) * 100

            if (stepStartRef.current.index !== furthest) {
                const restarted = furthest < stepStartRef.current.index // logs reset — a new launch
                stepStartRef.current = { index: furthest, at: Date.now() }
                if (restarted) {
                    setBarValue(0)
                    return
                }
            }

            const elapsed = (Date.now() - stepStartRef.current.at) / 1000
            const fraction = stepSeconds > 0 ? Math.min(elapsed / stepSeconds, 1) : 0
            const target = Math.round(base + (next - base) * fraction)
            setBarValue((prev) => Math.max(prev, target))
            refreshRelativeTimes((n) => n + 1)
        }
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [isVisible, buildLog, agentLog])

    if (!isVisible) return null

    const { secondsRemaining } = launchProgress(buildLog, agentLog)

    // Anchor the estimate to the last activity. Once we blow past it (logs went quiet), drop the
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

    return (
        <Stack gap={2}>
            <Progress value={barValue} size="lg" striped animated aria-label="Launch progress" />
            <Text size="xs" c="dimmed">
                {caption}
            </Text>
        </Stack>
    )
}
