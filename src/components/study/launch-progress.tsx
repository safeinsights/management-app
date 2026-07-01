import { type TimedStep } from '@/hooks/use-timed-progress'
import { TimedProgressBar } from '@/components/timed-progress-bar'
import { LaunchLogs } from './launch-logs'

// The accumulated logs a launch step's predicate is matched against.
type LaunchLogs = { buildLog: string; agentLog: string }

// Ordered launch milestones: each has an estimate of how long it takes until the next one and a
// predicate detecting when it has started (its marker line appears in the relevant log). Tune the
// estimates as real timings are observed.
export const LAUNCH_STEPS: TimedStep<LaunchLogs>[] = [
    { estimateSeconds: 5, hasStarted: ({ buildLog }) => buildLog.includes('Initializing the backend...') },
    {
        estimateSeconds: 5,
        hasStarted: ({ buildLog }) => buildLog.includes('data.aws_secretsmanager_secret.harbor_secret: Refreshing...'),
    },
    {
        estimateSeconds: 5,
        hasStarted: ({ buildLog }) => buildLog.includes('aws_ecs_service.workspace[0]: Plan to create'),
    },
    {
        estimateSeconds: 70,
        hasStarted: ({ buildLog }) => buildLog.includes('aws_ecs_task_definition.workspace[0]: Plan to create'),
    },
    { estimateSeconds: 10, hasStarted: ({ agentLog }) => agentLog.includes('+ mkdir -p ~/.cache/code-server') },
    { estimateSeconds: 30, hasStarted: ({ agentLog }) => agentLog.includes('Installing extensions...') },
]

interface LaunchProgressProps {
    isVisible: boolean
    buildLog: string
    agentLog: string
    lastUpdatedAt?: Date | null
}

// Launch progress bar: a TimedProgressBar wired to the launch milestones.
export function LaunchProgress({ isVisible, buildLog, agentLog, lastUpdatedAt }: LaunchProgressProps) {
    return (
        <TimedProgressBar
            isVisible={isVisible}
            steps={LAUNCH_STEPS}
            data={{ buildLog, agentLog }}
            lastUpdatedAt={lastUpdatedAt}
            label="Launch progress"
        >
            <LaunchLogs buildLog={buildLog} agentLog={agentLog} />
        </TimedProgressBar>
    )
}
