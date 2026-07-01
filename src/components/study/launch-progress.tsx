import { type TimedStep } from '@/hooks/use-timed-progress'
import { TimedProgressBar } from '@/components/timed-progress-bar'

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
        estimateSeconds: 80,
        hasStarted: ({ buildLog }) => buildLog.includes('aws_ecs_task_definition.workspace[0]: Plan to create'),
    },
    { estimateSeconds: 15, hasStarted: ({ agentLog }) => agentLog.includes('+ mkdir -p ~/.cache/code-server') },
    { estimateSeconds: 15, hasStarted: ({ agentLog }) => agentLog.includes('Installing extensions...') },
]

interface LaunchProgressProps {
    isVisible: boolean
    buildLog: string
    agentLog: string
    lastUpdatedAt?: Date | null
}

// Launch progress bar: a TimedProgressBar wired to the launch milestones. The raw logs are passed as
// the collapsible detail, which TimedProgressBar only reveals in spy/debug mode.
export function LaunchProgress({ isVisible, buildLog, agentLog, lastUpdatedAt }: LaunchProgressProps) {
    const logs = ['--------- Build Log', buildLog, '--------- Agent Log', agentLog].join('\n')

    return (
        <TimedProgressBar
            isVisible={isVisible}
            steps={LAUNCH_STEPS}
            data={{ buildLog, agentLog }}
            lastUpdatedAt={lastUpdatedAt}
            label="Launch progress"
        >
            <textarea readOnly value={logs} rows={24} style={{ width: '100%' }} />
        </TimedProgressBar>
    )
}
