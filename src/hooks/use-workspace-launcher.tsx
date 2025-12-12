import { useMutation, useQuery } from '@/common'
import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/coder.actions'
import { notifications } from '@mantine/notifications'
import { useState, useCallback } from 'react'

interface OpenResult {
    success: boolean
    blocked: boolean
    url: string
}

const openWorkspaceInNewTab = (url: string): OpenResult => {
    const newWindow = window.open(url, 'child')
    const blocked = !newWindow || newWindow.closed || typeof newWindow.closed === 'undefined'
    return { success: !blocked, blocked, url }
}

interface UseWorkspaceLauncherOptions {
    studyId: string
}

interface UseWorkspaceLauncherReturn {
    launchWorkspace: () => void
    isLoading: boolean
    isPending: boolean
    error: Error | null
    clearError: () => void
}

export function useWorkspaceLauncher({ studyId }: UseWorkspaceLauncherOptions): UseWorkspaceLauncherReturn {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutation = useMutation({
        mutationFn: async ({ studyId }: { studyId: string }) => {
            const result = await createUserAndWorkspaceAction({ studyId })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : 'Failed to launch IDE')
            }
            return result
        },
        onMutate: () => {
            setLoading(true)
            setError(null)
        },
        onSuccess: (data) => {
            const { id } = data.workspace
            setWorkspaceId(id)
        },
        onError: (err) => {
            setLoading(false)
            const errorMessage = err instanceof Error ? err.message : 'Failed to launch IDE'
            setError(new Error(errorMessage))
        },
    })

    const workspaceQuery = useQuery({
        queryKey: ['coder', 'workspaceStatus', studyId, workspaceId],
        enabled: !!workspaceId,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = await getWorkspaceUrlAction({
                studyId,
                workspaceId: workspaceId as string,
            })
            if (result && typeof result === 'object' && 'error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : 'Failed to get workspace URL')
            }
            return result
        },
        refetchInterval: (query) => {
            if (!workspaceId) return false
            if (query.state.error) {
                setLoading(false)
                const errorMessage =
                    query.state.error instanceof Error ? query.state.error.message : 'Failed to get workspace URL'
                setError(new Error(errorMessage))
                return false
            }
            const url = query.state.data
            if (url) {
                const result = openWorkspaceInNewTab(url)
                setLoading(false)
                if (result.blocked) {
                    setError(new Error('Popup blocked'))
                    notifications.show({
                        title: 'Popup blocked',
                        message: (
                            <a href={url} target="_blank" rel="noopener noreferrer">
                                Click here to open your workspace
                            </a>
                        ),
                        color: 'yellow',
                        autoClose: false,
                    })
                }
                return false
            }
            return 5000
        },
    })

    const launchWorkspace = useCallback(() => {
        setError(null)
        mutation.mutate({ studyId })
    }, [mutation, studyId])

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    return {
        launchWorkspace,
        isLoading: loading,
        isPending: mutation.isPending,
        error: error || workspaceQuery.error || null,
        clearError,
    }
}
