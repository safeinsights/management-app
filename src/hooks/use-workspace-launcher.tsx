import { useMutation, useQueryClient } from '@/common'
import { reportError } from '@/components/errors'
import { ActionFailure } from '@/lib/errors'
import { ensureWorkspaceAction } from '@/server/actions/workspaces.actions'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
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
    /** True while the entire launch flow is in progress (from ensure start until the workspace opens or fails) */
    isLaunching: boolean
    /** True only while the initial ensure (create/start) mutation is in progress */
    isCreatingWorkspace: boolean
    error: Error | null
    clearError: () => void
    /** Latest progress poll (build/agent status + log lines), or undefined before the first poll */
    status: WorkspaceLaunchStatus | undefined
    /** Local time a new build/agent log line last arrived, for the "last updated … ago" hint */
    lastUpdatedAt: Date | null
    /** Full build/agent logs accumulated across polls */
    buildLog: string
    agentLog: string
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

    // The workspace opens asynchronously after polling resolves, so the sameWindow intent from the
    // click has to be latched here (at click time) rather than read when the tab finally opens.
    const sameWindowRef = useRef(false)

    // Opening the tab is a one-shot side effect fired when the poll yields a url; the ref latches
    // it to that url so a re-render (or StrictMode double-invoke) can't open it twice.
    const handledUrlRef = useRef<string | null>(null)
    useEffect(() => {
        const url = buildStatus.url
        if (!url || handledUrlRef.current === url) return

        handledUrlRef.current = url
        const { blocked } = openWorkspace(url, studyId, sameWindowRef.current)
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

    const launchWorkspace = useCallback(
        (options?: LaunchOptions) => {
            sameWindowRef.current = options?.sameWindow ?? false
            clearError()
            ensure.mutate({ studyId })
        },
        [clearError, ensure, studyId],
    )

    const statusFailure = buildStatus.failed ? new Error(buildStatus.reason || LAUNCH_FAILED_MESSAGE) : null
    const waitingForWorkspace = ensure.isSuccess && !buildStatus.url && !buildStatus.failed && !buildStatus.error
    const isLaunching = ensure.isPending || waitingForWorkspace

    return {
        launchWorkspace,
        isLaunching,
        isCreatingWorkspace: ensure.isPending,
        error: toLaunchError(ensure.error || buildStatus.error || statusFailure || null),
        clearError,
        status: buildStatus.status,
        lastUpdatedAt: buildStatus.lastUpdatedAt,
        buildLog: buildStatus.buildLog,
        agentLog: buildStatus.agentLog,
    }
}
