import { Button } from '@mantine/core'
import { ArrowSquareOutIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
import { CompactStatusButton } from './compact-status-button'

export type LaunchIdeButtonVariant = 'cta' | 'outline'

interface LaunchIdeButtonProps {
    onClick: () => void
    isLaunching: boolean
    launchError: Error | null
    variant: LaunchIdeButtonVariant
    /** Latest progress poll — drives the build/agent activity lines shown while launching */
    status?: WorkspaceLaunchStatus | null
}

// Concise status summary shown under "Launching IDE" — the build status and the agent's
// lifecycle/connection/code-server health. The full logs render separately in <LaunchLogs>.
function launchProgressLines(status: WorkspaceLaunchStatus | null | undefined): string[] {
    if (!status) return []
    const lines = [`Build: ${status.buildStatus}`]
    const agent = status.agentStatus
    if (agent) {
        lines.push(
            `Agent: lifecycle=${agent.lifecycle ?? '∅'} status=${agent.status ?? '∅'} code-server=${agent.codeServer ?? '∅'}`,
        )
    }
    return lines
}

export function LaunchIdeButton({ onClick, isLaunching, launchError, variant, status }: LaunchIdeButtonProps) {
    if (launchError) {
        return (
            <CompactStatusButton
                icon={<WarningCircleIcon size={14} weight="fill" />}
                primaryText="Launch failed"
                secondaryText="Please try again later"
                color="red"
                onClick={onClick}
            />
        )
    }

    if (isLaunching) {
        const lines = launchProgressLines(status)
        const secondaryText = (lines.length ? lines : [status?.reason ?? 'Starting…']).join('\n')
        return <CompactStatusButton primaryText="Launching IDE" secondaryText={secondaryText} loading />
    }

    if (variant === 'cta') {
        return (
            <Button variant="primary" rightSection={<ArrowSquareOutIcon size={16} />} onClick={onClick}>
                Launch IDE
            </Button>
        )
    }

    return (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={onClick}>
            Edit files in IDE
        </Button>
    )
}
