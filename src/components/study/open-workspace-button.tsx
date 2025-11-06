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
    const [workspaceLoading, setWorkspaceLoading] = useState<boolean>(false)
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)

    if (workspaceUrl) openWorkspaceInNewTab(workspaceUrl)
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

    const { data: _statusData } = useQuery({
        queryKey: ['workspaceStatus', workspaceId],
        enabled: !!workspaceId,
        queryFn: () =>
            new Promise<{ status: string; url?: string }>((resolve, reject) => {
                if (!workspaceId) return reject('no workspace id')
                const events = new EventSource(`/api/workspace-status/${workspaceId}`)

                events.addEventListener('status', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    setWorkspaceLoading(true)
                    queryClient.setQueryData(['workspaceStatus', workspaceId], data)
                })

                events.addEventListener('ready', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    setWorkspaceUrl(data.url)
                    openWorkspaceInNewTab(data.url)
                    setWorkspaceLoading(false)
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
                loading={workspaceLoading}
                aria-busy={workspaceLoading}
                aria-disabled={workspaceLoading}
            >
                {workspaceLoading ? 'Workspace Starting' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
