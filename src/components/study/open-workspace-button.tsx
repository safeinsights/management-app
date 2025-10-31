'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspaceAction } from '@/server/actions/coder.actions'
import { Alert, Button, Group } from '@mantine/core'
// eslint-disable-next-line no-restricted-imports
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface OpenWorkspaceButtonProps {
    name: string
    email: string
    userId: string
    studyId: string
}

// Helper function to open workspace in new tab
// const openWorkspaceInNewTab = (url: string) => {
//     const target = '_blank'
//     const windowRef = window.open(url, target)
//     if (windowRef) windowRef.focus()
// }

export const OpenWorkspaceButton = ({ name, email, userId, studyId }: OpenWorkspaceButtonProps) => {
    const queryClient = useQueryClient()
    // const [error, setError] = useState<string | null>(null)
    // const [success, setSuccess] = useState<string | null>(null)
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)

    const mutation = useMutation({
        mutationFn: ({
            name,
            email,
            userId,
            studyId,
        }: {
            name: string
            email: string
            userId: string
            studyId: string
        }) => createUserAndWorkspaceAction({ name, userId, email, studyId }),
        onSuccess: (data) => {
            console.warn(data)
            if (isActionError(data)) {
                // setError(typeof data.error === 'string' ? data.error : 'Failed to create workspace')
            } else if (data.success) {
                setWorkspaceId(data.workspace.id)
                // setSuccess(`Workspace creation in progress!: ${data.workspaceName}`)
                queryClient.invalidateQueries({ queryKey: ['workspaceStatus', data.workspace.status] })
            } else {
                // setError('Failed to create workspace')
            }
        },
    })

    const { data: statusData, isLoading } = useQuery({
        queryKey: ['workspaceStatus', workspaceId],
        enabled: !!workspaceId,
        queryFn: () =>
            new Promise<{ status: string; url?: string }>((resolve, reject) => {
                if (!workspaceId) return reject('no workspace id')

                const events = new EventSource(`/api/workspace-status/${workspaceId}`)

                events.addEventListener('status', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    console.log('status', data)
                    queryClient.setQueryData(['workspaceStatus', workspaceId], data)
                })

                events.addEventListener('ready', (e) => {
                    const data = JSON.parse((e as MessageEvent).data)
                    console.log('Code server is ready!!! woohoo', data)
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
            {
                <p>
                    Status: {JSON.stringify(statusData?.status)}, loading: {isLoading}
                </p>
            }
            <Button
                onClick={() => mutation.mutate({ name, email, userId, studyId })}
                disabled={mutation.isPending || !!workspaceId}
                loading={mutation.isPending}
                aria-busy={mutation.isPending}
                aria-disabled={mutation.isPending}
            >
                {!mutation.isPending ? 'Start Workspace' : 'Creating Workspace'}
            </Button>
        </Group>
    )
}
