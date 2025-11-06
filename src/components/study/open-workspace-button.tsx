'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspaceAction } from '@/server/actions/coder.actions'
import { Button, Group } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { useState } from 'react'

interface OpenWorkspaceButtonProps {
    studyId: string
    orgSlug: string
}

const openWorkspaceInNewTab = (url: string) => {
    const target = '_blank'
    const windowRef = window.open(url, target)
    if (windowRef) windowRef.focus()
}

export const OpenWorkspaceButton = ({ studyId, orgSlug }: OpenWorkspaceButtonProps) => {
    const queryClient = useQueryClient()
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)

    const mutation = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId, orgSlug }),
        onSuccess: (data) => {
            if (isActionError(data)) {
                console.warn(`ERROR: ${JSON.stringify(data)}`)
            } else if (data.success) {
                setWorkspaceId(data.workspace.id)
                queryClient.invalidateQueries({ queryKey: ['workspaceStatus', data.workspace.status] })
            } else {
                console.error('Failed to create workspace')
            }
        },
    })

    const { isLoading } = useQuery({
        queryKey: ['workspaceStatus', workspaceId],
        enabled: !!workspaceId,
        queryFn: () =>
            new Promise<{ status: string; url?: string }>((resolve, reject) => {
                if (!workspaceId) return reject('no workspace id')
                const events = new EventSource(`/api/workspace-status/${workspaceId}`)

                events.addEventListener('status', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    queryClient.setQueryData(['workspaceStatus', workspaceId], data)
                })

                events.addEventListener('ready', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    openWorkspaceInNewTab(data.url)
                    events.close()
                    resolve({ status: 'ready', url: data.url })
                })

                events.addEventListener('error', () => {
                    console.error('error in ws')
                    events.close()
                    reject('error')
                })
            }),
        staleTime: Infinity,
        refetchOnWindowFocus: true,
    })

    return (
        <Group gap="sm">
            <Button
                onClick={() => mutation.mutate({ studyId })}
                loading={isLoading}
                aria-busy={isLoading}
                aria-disabled={isLoading}
            >
                {isLoading ? 'Workspace Starting' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
