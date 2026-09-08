import { useMutation, useQueryClient } from '@/common'
import { reportError } from '@/components/errors'
import { ActionFailure } from '@/lib/errors'
import { ensureWorkspaceAction } from '@/server/actions/workspaces.actions'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
import { notifications } from '@mantine/notifications'
import { useCallback, useEffect, useRef } from 'react'
import { useWorkspaceBuildStatus } from './use-workspace-build-status'

const LAUNCH_FAILED_MESSAGE = 'Failed to launch IDE'

// ActionFailure's message is the raw `error` payload, so an opaque one would leak JSON to the user.
const toLaunchError = (err: Error | null): Error | null => {
    if (!err) return null
    if (err instanceof ActionFailure && typeof err.error !== 'string') return new Error(LAUNCH_FAILED_MESSAGE)
    return err
}

const openWorkspace = (url: string, studyId: string, sameWindow: boolean): { blocked: boolean } => {
    // sameWindow keeps the workspace in one Playwright page context and dodges the popup blocker.
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
    isLaunching: boolean
    isCreatingWorkspace: boolean
    error: Error | null
    clearError: () => void
    status: WorkspaceLaunchStatus | undefined
    lastUpdatedAt: Date | null
    buildLog: string
    agentLog: string
}

const STATUS_QUERY_KEY = 'workspace-build-status'

export function useWorkspaceLauncher({ studyId, onSuccess }: UseWorkspaceLauncherOptions): UseWorkspaceLauncherReturn {
    const queryClient = useQueryClient()

    const ensure = useMutation({
        mutationFn: ({ studyId }: { studyId: string }) => ensureWorkspaceAction({ studyId }),
        onError: (err) => reportError(err, LAUNCH_FAILED_MESSAGE),
    })

    const buildStatus = useWorkspaceBuildStatus({ studyId, enabled: ensure.isSuccess })

    // Latched at click time because the workspace opens asynchronously, after polling resolves.
    const sameWindowRef = useRef(false)

    // Latched to the url so a re-render or StrictMode double-invoke cannot open the tab twice.
    const handledUrlRef = useRef<string | null>(null)
    useEffect(() => {
        const url = buildStatus.url
        if (!url || handledUrlRef.current === url) return

        handledUrlRef.current = url
        const { blocked } = openWorkspace(url, studyId, sameWindowRef.current)
        if (blocked) notifyPopupBlocked(url)
        onSuccess?.()
    }, [buildStatus.url, studyId, onSuccess])

    const reportedErrorRef = useRef<unknown>(null)
    useEffect(() => {
        if (buildStatus.error && reportedErrorRef.current !== buildStatus.error) {
            reportedErrorRef.current = buildStatus.error
            reportError(buildStatus.error, LAUNCH_FAILED_MESSAGE)
        }
    }, [buildStatus.error])

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
