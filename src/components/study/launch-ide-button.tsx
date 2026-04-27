import { Button } from '@mantine/core'
import { ArrowSquareOutIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { CompactStatusButton } from './compact-status-button'

export type LaunchIdeButtonVariant = 'cta' | 'outline'

interface LaunchIdeButtonProps {
    onClick: () => void
    isLaunching: boolean
    launchError: Error | null
    variant: LaunchIdeButtonVariant
}

export function LaunchIdeButton({ onClick, isLaunching, launchError, variant }: LaunchIdeButtonProps) {
    const { messageWithEllipsis } = useLoadingMessages(isLaunching)

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
        return <CompactStatusButton primaryText="Launching IDE" secondaryText={messageWithEllipsis} loading />
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
