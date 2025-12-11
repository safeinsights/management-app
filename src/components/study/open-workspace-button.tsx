'use client'

import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { Button, Group } from '@mantine/core'

interface OpenWorkspaceButtonProps {
    studyId: string
}

export const OpenWorkspaceButton = ({ studyId }: OpenWorkspaceButtonProps) => {
    const { launchWorkspace, isLoading, isPending } = useWorkspaceLauncher({ studyId })

    return (
        <Group>
            <Button onClick={launchWorkspace} loading={isLoading || isPending}>
                {isLoading ? 'Workspace Starting…' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
