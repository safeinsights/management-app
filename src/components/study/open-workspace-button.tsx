'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspaceAction } from '@/server/actions/coder.actions'
import { Button, Group } from '@mantine/core'
// eslint-disable-next-line no-restricted-imports
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

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
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const eventSourceRef = useRef<EventSource | null>(null)

    const mutation = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId, orgSlug }),
        onMutate: () => setLoading(true),
        onSuccess: (data) => {
            if (isActionError(data) || !data.success) {
                console.error('Failed to create workspace:', data)
                setLoading(false)
                return
            }
            setWorkspaceId(data.workspace.id)
        },
        onError: () => {
            setLoading(false)
        },
    })

    // 🔄 When workspace ID is created → start SSE listener
    useEffect(() => {
        if (!workspaceId) return

        const es = new EventSource(`/api/workspace-status/${workspaceId}`)
        eventSourceRef.current = es

        es.addEventListener('status', (e) => {
            const data = JSON.parse((e as MessageEvent).data)
            console.log('status update', data)
        })

        es.addEventListener('ready', (e) => {
            const data = JSON.parse((e as MessageEvent).data)
            console.log('workspace ready', data)

            openWorkspaceInNewTab(data.url)
            setLoading(false)
            es.close()
        })

        es.addEventListener('error', () => {
            console.error('SSE error')
            setLoading(false)
            es.close()
        })

        return () => {
            es.close()
        }
    }, [workspaceId])

    return (
        <Group>
            <Button onClick={() => mutation.mutate({ studyId })} loading={loading || mutation.isPending}>
                {loading ? 'Workspace Starting…' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
