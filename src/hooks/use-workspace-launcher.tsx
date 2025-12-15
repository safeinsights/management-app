import { useMutation, useQuery } from '@/common'
import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/workspaces.actions'
import { notifications } from '@mantine/notifications'
import { useState, useCallback, useEffect, useRef } from 'react'

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
    onSuccess?: () => void
}

interface UseWorkspaceLauncherReturn {
    launchWorkspace: () => void
    /** True while the entire launch flow is in progress (from mutation start to workspace open) */
    isLaunching: boolean
    /** True only while the initial workspace creation mutation is in progress */
    isCreatingWorkspace: boolean
    error: Error | null
    clearError: () => void
}

export function useWorkspaceLauncher({ studyId, onSuccess }: UseWorkspaceLauncherOptions): UseWorkspaceLauncherReturn {
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)
    const [launchComplete, setLaunchComplete] = useState(false)
    const onSuccessRef = useRef(onSuccess)

    useEffect(() => {
        onSuccessRef.current = onSuccess
    }, [onSuccess])

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
        enabled: !!workspaceId && !launchComplete,
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
            if (!workspaceId || launchComplete) return false
            if (query.state.error || query.state.data) return false
            return 5000
        },
    })

    // Handle query results
    useEffect(() => {
        if (launchComplete) return

        if (workspaceQuery.error) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- React Query v5 requires effects for query side effects
            setLaunchComplete(true)
            setLoading(false)
            const errorMessage =
                workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Failed to get workspace URL'
            setError(new Error(errorMessage))
            return
        }

        const url = workspaceQuery.data
        if (url) {
            setLaunchComplete(true)
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
            onSuccessRef.current?.()
        }
    }, [workspaceQuery.data, workspaceQuery.error, launchComplete])

    const launchWorkspace = useCallback(() => {
        setError(null)
        setLaunchComplete(false)
        mutation.mutate({ studyId })
    }, [mutation, studyId])

    const clearError = useCallback(() => {
        setError(null)
    }, [])

    return {
        launchWorkspace,
        isLaunching: loading,
        isCreatingWorkspace: mutation.isPending,
        error: error || workspaceQuery.error || null,
        clearError,
    }
}
