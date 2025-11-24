'use client'

import { useMutation, useQuery } from '@/common'
import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/coder.actions'
import { Button, Group } from '@mantine/core'
import { useState } from 'react'

interface OpenWorkspaceButtonProps {
    studyId: string
}

const openWorkspaceInNewTab = (url: string) => {
    window.open(url, 'child')
}

export const OpenWorkspaceButton = ({ studyId }: OpenWorkspaceButtonProps) => {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const mutation = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId }),
        onMutate: () => {
            setLoading(true)
        },
        onSuccess: (data) => {
            const { id } = data.workspace
            setWorkspaceId(id)
        },
        onError: () => setLoading(false),
    })

    useQuery({
        queryKey: ['coder', 'workspaceStatus', studyId, workspaceId],
        enabled: !!workspaceId,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            return await getWorkspaceUrlAction({
                studyId,
                workspaceId: workspaceId as string,
            })
        },
        refetchInterval: (query) => {
            if (!workspaceId) return false
            const url = query.state.data
            if (url) {
                openWorkspaceInNewTab(url)
                setLoading(false)
                return false
            }
            return 5000
        },
    })

    return (
        <Group>
            <Button onClick={() => mutation.mutate({ studyId })} loading={loading || mutation.isPending}>
                {loading ? 'Workspace Starting…' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
