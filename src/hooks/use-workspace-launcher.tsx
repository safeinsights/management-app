import { useMutation, useQueryClient } from '@/common'
import { reportError } from '@/components/errors'
import { ActionFailure } from '@/lib/errors'
import { ensureWorkspaceAction } from '@/server/actions/workspaces.actions'
import { notifications } from '@mantine/notifications'
import { useCallback, useEffect, useRef } from 'react'
import { useWorkspaceBuildStatus } from './use-workspace-build-status'

const LAUNCH_FAILED_MESSAGE = 'Failed to launch IDE'

// The wrapped useQuery/useMutation throw an ActionFailure whose message is the raw `error` payload.
// For an opaque (non-string) action error, surface a friendly fallback instead of leaking raw JSON.
const toLaunchError = (err: Error | null): Error | null => {
    if (!err) return null
    if (err instanceof ActionFailure && typeof err.error !== 'string') return new Error(LAUNCH_FAILED_MESSAGE)
    return err
}

const openWorkspaceInNewTab = (url: string, studyId: string): { blocked: boolean } => {
    const newWindow = window.open(url, `ide-for-study-${studyId}`)
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

interface UseWorkspaceLauncherReturn {
    launchWorkspace: () => void
    /** True while the entire launch flow is in progress (from ensure start until the workspace opens or fails) */
    isLaunching: boolean
    /** True only while the initial ensure (create/start) mutation is in progress */
    isCreatingWorkspace: boolean
    error: Error | null
    clearError: () => void
    /** Human-readable readiness reason for the current poll */
    reason: string | null
    /** ISO timestamp of the most recent Coder log line — proves the build is actively progressing */
    lastLogAt: string | null
}

const STATUS_QUERY_KEY = 'workspace-build-status'

export function useWorkspaceLauncher({ studyId, onSuccess }: UseWorkspaceLauncherOptions): UseWorkspaceLauncherReturn {
    const queryClient = useQueryClient()

    // Ensure the workspace exists and is running (creates if missing, starts if stopped).
    const ensure = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => ensureWorkspaceAction({ studyId }),
        onError: (err) => reportError(err, LAUNCH_FAILED_MESSAGE),
    })

    const buildStatus = useWorkspaceBuildStatus({ studyId, enabled: ensure.isSuccess })

    // Opening the tab is a one-shot side effect fired when the poll yields a url; the ref latches
    // it to that url so a re-render (or StrictMode double-invoke) can't open it twice.
    const handledUrlRef = useRef<string | null>(null)
    useEffect(() => {
        const url = buildStatus.url
        if (!url || handledUrlRef.current === url) return

        handledUrlRef.current = url
        const { blocked } = openWorkspaceInNewTab(url, studyId)
        if (blocked) notifyPopupBlocked(url)
        onSuccess?.()
    }, [buildStatus.url, studyId, onSuccess])

    // Report a polling failure (query error) once, latched to the specific error.
    const reportedErrorRef = useRef<unknown>(null)
    useEffect(() => {
        if (buildStatus.error && reportedErrorRef.current !== buildStatus.error) {
            reportedErrorRef.current = buildStatus.error
            reportError(buildStatus.error, LAUNCH_FAILED_MESSAGE)
        }
    }, [buildStatus.error])

    // Report a failed build (the poll succeeds but reports failure) once per launch.
    const reportedFailureRef = useRef(false)
    useEffect(() => {
        if (buildStatus.failed && !reportedFailureRef.current) {
            reportedFailureRef.current = true
            reportError(new Error(buildStatus.reason || LAUNCH_FAILED_MESSAGE), LAUNCH_FAILED_MESSAGE)
        }
    }, [buildStatus.failed, buildStatus.reason])

    const clearError = useCallback(() => {
        ensure.reset()
        handledUrlRef.current = null
        reportedErrorRef.current = null
        reportedFailureRef.current = false
        queryClient.removeQueries({ queryKey: [STATUS_QUERY_KEY, studyId] })
    }, [ensure, queryClient, studyId])

    const launchWorkspace = useCallback(() => {
        clearError()
        ensure.mutate({ studyId })
    }, [clearError, ensure, studyId])

    const statusFailure = buildStatus.failed ? new Error(buildStatus.reason || LAUNCH_FAILED_MESSAGE) : null
    const waitingForWorkspace = ensure.isSuccess && !buildStatus.url && !buildStatus.failed && !buildStatus.error
    const isLaunching = ensure.isPending || waitingForWorkspace

    return {
        launchWorkspace,
        isLaunching,
        isCreatingWorkspace: ensure.isPending,
        error: toLaunchError(ensure.error || buildStatus.error || statusFailure || null),
        clearError,
        reason: buildStatus.reason,
        lastLogAt: buildStatus.lastLogAt,
    }
}
