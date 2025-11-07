'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspaceAction } from '@/server/actions/coder.actions'
import { Button, Group } from '@mantine/core'
import { useMutation } from '@/common'
import { useEffect, useRef, useState } from 'react'

interface OpenWorkspaceButtonProps {
    studyId: string
    orgSlug: string
}

const openWorkspaceInNewTab = (url: string) => {
    // TODO Determine if we want to reopen existing tab (child) or open new tab every time (_blank)
    const windowRef = window.open(url, 'child')
    windowRef?.focus()
}

export const OpenWorkspaceButton = ({ studyId, orgSlug }: OpenWorkspaceButtonProps) => {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const eventSourceRef = useRef<EventSource | null>(null)

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

    // 🔄 SSE listener if workspace isn't ready yet
    useEffect(() => {
        if (!workspaceId) return

        const es = new EventSource(`/api/workspace-status/${workspaceId}`)
        eventSourceRef.current = es

        // TODO We don't really need status... but maybe?
        // es.addEventListener('status', (e) => {
        //     const data = JSON.parse((e as MessageEvent).data)
        // })

        es.addEventListener('ready', (e) => {
            const data = JSON.parse((e as MessageEvent).data)
            setWorkspaceUrl(data.url)
            openWorkspaceInNewTab(data.url)
            setLoading(false)
            es.close()
        })

        es.addEventListener('error', () => {
            console.error('SSE error')
            setLoading(false)
            es.close()
        })

        return () => es.close()
    }, [workspaceId])

    return (
        <Group>
            <Button onClick={() => mutation.mutate({ studyId })} loading={loading || mutation.isPending}>
                {loading ? 'Workspace Starting…' : 'Open Workspace'}
            </Button>
        </Group>
    )
}
