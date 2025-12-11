import { useMutation, useQuery } from '@/common'
import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/coder.actions'
import { useState, useCallback } from 'react'

const openWorkspaceInNewTab = (url: string) => {
    window.open(url, 'child')
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
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId }),
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
            setError(err instanceof Error ? err : new Error('Failed to launch IDE'))
        },
    })

    const workspaceQuery = useQuery({
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
            if (query.state.error) {
                setLoading(false)
                setError(
                    query.state.error instanceof Error ? query.state.error : new Error('Failed to get workspace URL'),
                )
                return false
            }
            const url = query.state.data
            if (url) {
                openWorkspaceInNewTab(url)
                setLoading(false)
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
