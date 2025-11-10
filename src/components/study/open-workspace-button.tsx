'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspaceAction, getWorkspaceStatusAction } from '@/server/actions/coder.actions'
import { Button, Group } from '@mantine/core'
import { useMutation } from '@/common'
// eslint-disable-next-line no-restricted-imports
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CoderWorkspaceEvent } from '@/server/coder'

interface OpenWorkspaceButtonProps {
    studyId: string
    orgSlug: string
}

const openWorkspaceInNewTab = (url: string) => {
    // TODO Determine if we want to reopen existing tab (child) or open new tab every time (_blank)
    const windowRef = window.open(url, 'child')
    windowRef?.focus()
}

export function isWorkspaceReady(event: CoderWorkspaceEvent): boolean {
    const resources = event.latest_build?.resources
    if (!resources || resources.length === 0) return false

    for (const resource of resources) {
        for (const agent of resource.agents ?? []) {
            const lifecycle = (agent.lifecycle_state ?? '').toLowerCase()
            const status = (agent.status ?? '').toLowerCase()

            // Consider agent ready if lifecycle is 'ready' or status is 'ready'/'connected'
            const agentReady = lifecycle === 'ready' || status === 'ready' || status === 'connected'

            // Require a healthy code-server app on the same agent
            const codeServerHealthy = (agent.apps ?? []).some(
                (app) => app.slug === 'code-server' && (app.health ?? '').toLowerCase() === 'healthy',
            )

            if (agentReady && codeServerHealthy) {
                return true
            }
        }
    }

    return false
}

export const OpenWorkspaceButton = ({ studyId, orgSlug }: OpenWorkspaceButtonProps) => {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const mutation = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId, orgSlug }),
        onMutate: () => {
            setLoading(true)
        },
        onSuccess: (data) => {
            if (isActionError(data) || !data.success) {
                console.error('Workspace creation failed:', data)
                setLoading(false)
                return
            }

            if (workspaceUrl) {
                setLoading(false)
                return openWorkspaceInNewTab(workspaceUrl)
            }

            const { id } = data.workspace

            setWorkspaceId(id) // triggers SSE subscription
        },
        onError: () => setLoading(false),
    })

    // Start polling only when we have a workspaceId
    const { data: status, isFetching: isPolling } = useQuery({
        queryKey: ['coder', 'workspaceStatus', studyId, workspaceId],
        enabled: !!workspaceId,
        queryFn: async () => {
            // Important: pass the workspaceId you saved from the mutation
            return await getWorkspaceStatusAction({
                studyId,
                workspaceId: workspaceId as string,
            })
        },
        // Poll while a workspace exists AND it's not ready yet.
        // Returning false stops polling automatically when ready.
        refetchInterval: (query) => {
            if (!workspaceId) return false
            const current = query.state.data
            console.log(current)
            return current && isWorkspaceReady(current) ? false : 2000
        },
    })

    console.log('status', status)
    console.log('isPolling', isPolling)

    return (
        <Group>
            <Button onClick={() => mutation.mutate({ studyId })} loading={loading || mutation.isPending}>
                {loading ? 'Workspace Starting…' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
