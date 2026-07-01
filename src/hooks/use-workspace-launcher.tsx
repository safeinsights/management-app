import { useMutation, useQuery, useQueryClient } from '@/common'
import { reportError } from '@/components/errors'
import { ActionFailure } from '@/lib/errors'
import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/workspaces.actions'
import { notifications } from '@mantine/notifications'
import { useCallback, useEffect, useRef } from 'react'

const LAUNCH_FAILED_MESSAGE = 'Failed to launch IDE'

// The wrapped useQuery/useMutation throw an ActionFailure whose message is the raw `error` payload.
// For an opaque (non-string) action error, surface a friendly fallback instead of leaking raw JSON.
const toLaunchError = (err: Error | null): Error | null => {
    if (!err) return null
    if (err instanceof ActionFailure && typeof err.error !== 'string') return new Error(LAUNCH_FAILED_MESSAGE)
    return err
}

const openWorkspace = (url: string, studyId: string, sameWindow: boolean): { blocked: boolean } => {
    // sameWindow (ctrl-click) navigates the current tab, which keeps the workspace in the same
    // Playwright page context and avoids the popup-blocker path — it makes e2e testing simpler.
    const target = sameWindow ? '_self' : `ide-for-study-${studyId}`
    const newWindow = window.open(url, target)
    const blocked = !newWindow || newWindow.closed || typeof newWindow.closed === 'undefined'
    return { blocked }
}

const notifyPopupBlocked = (url: string) => {
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

interface UseWorkspaceLauncherOptions {
    studyId: string
    onSuccess?: () => void
}

interface LaunchOptions {
    /** When true (ctrl-click), open the IDE in the current tab instead of a new window. */
    sameWindow?: boolean
}

interface UseWorkspaceLauncherReturn {
    launchWorkspace: (options?: LaunchOptions) => void
    /** True while the entire launch flow is in progress (from mutation start until the workspace opens or fails) */
    isLaunching: boolean
    /** True only while the initial workspace creation mutation is in progress */
    isCreatingWorkspace: boolean
    error: Error | null
    clearError: () => void
}

const WORKSPACE_STATUS_KEY = 'workspaceStatus'

export function useWorkspaceLauncher({ studyId, onSuccess }: UseWorkspaceLauncherOptions): UseWorkspaceLauncherReturn {
    const queryClient = useQueryClient()

    const creation = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => createUserAndWorkspaceAction({ studyId }),
        onError: (err) => reportError(err, LAUNCH_FAILED_MESSAGE),
    })
    const workspaceId = creation.data?.workspace.id ?? null

    // Once a workspace exists, poll until Coder hands back a URL (or the request errors out).
    // The URL is permanent for a given workspace, so once resolved the result never goes stale and
    // no refetch trigger (remount, reconnect, focus) should re-run the launch on the server.
    const urlQuery = useQuery({
        queryKey: ['coder', WORKSPACE_STATUS_KEY, studyId, workspaceId],
        enabled: !!workspaceId,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: () => getWorkspaceUrlAction({ studyId, workspaceId: workspaceId as string }),
        refetchInterval: (query) => (query.state.data || query.state.error ? false : 5000),
    })

    // The workspace opens asynchronously after polling resolves, so the sameWindow intent from the
    // click has to be latched here (at click time) rather than read when the tab finally opens.
    const sameWindowRef = useRef(false)

    // Opening the tab is a one-shot side effect fired when the poll resolves; the ref latches it to
    // the current workspace so a re-render (or StrictMode double-invoke) can't open it twice.
    const handledWorkspaceRef = useRef<string | null>(null)
    useEffect(() => {
        const url = urlQuery.data
        if (!url || !workspaceId || handledWorkspaceRef.current === workspaceId) return

        handledWorkspaceRef.current = workspaceId
        const { blocked } = openWorkspace(url, studyId, sameWindowRef.current)
        if (blocked) notifyPopupBlocked(url)
        onSuccess?.()
    }, [urlQuery.data, workspaceId, studyId, onSuccess])

    // Latch the report to the specific error so a StrictMode double-invoke (or re-render) can't
    // fire two Sentry events / notifications for the same failure.
    const reportedErrorRef = useRef<unknown>(null)
    useEffect(() => {
        if (urlQuery.error && reportedErrorRef.current !== urlQuery.error) {
            reportedErrorRef.current = urlQuery.error
            reportError(urlQuery.error, LAUNCH_FAILED_MESSAGE)
        }
    }, [urlQuery.error])

    const clearError = useCallback(() => {
        creation.reset()
        handledWorkspaceRef.current = null
        reportedErrorRef.current = null
        queryClient.removeQueries({ queryKey: ['coder', WORKSPACE_STATUS_KEY, studyId] })
    }, [creation, queryClient, studyId])

    const launchWorkspace = useCallback(
        (options?: LaunchOptions) => {
            sameWindowRef.current = options?.sameWindow ?? false
            clearError()
            creation.mutate({ studyId })
        },
        [clearError, creation, studyId],
    )

    const waitingForUrl = !!workspaceId && !urlQuery.data && !urlQuery.error
    const isLaunching = creation.isPending || waitingForUrl

    return {
        launchWorkspace,
        isLaunching,
        isCreatingWorkspace: creation.isPending,
        error: toLaunchError(creation.error || urlQuery.error || null),
        clearError,
    }
}
