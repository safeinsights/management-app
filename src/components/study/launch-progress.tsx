import { type TimedStep } from '@/hooks/use-timed-progress'
import { TimedProgressBar } from '@/components/timed-progress-bar'

type LaunchLogs = { buildLog: string; agentLog: string }

// Ordered milestones; the estimates are observational and meant to be retuned.
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
