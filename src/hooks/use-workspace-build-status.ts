'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@/common'
import { actionResult } from '@/lib/utils'
import { getWorkspaceLaunchStatusAction } from '@/server/actions/workspaces.actions'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'

interface UseWorkspaceBuildStatusOptions {
    studyId: string
    enabled: boolean
}

export interface UseWorkspaceBuildStatusReturn {
    status: WorkspaceLaunchStatus | undefined
    reason: string | null
    lastLogAt: string | null
    ready: boolean
    failed: boolean
    url: string | null
    error: Error | null
    isPolling: boolean
}

const POLL_INTERVAL_MS = 5000

// Polls the combined Coder build/agent status for a study's workspace. Carries per-source log
// cursors across refetches (via a ref, not the query key) so steady-state polls only pull new
// log lines, and stops polling once the launch reaches a terminal state.
export function useWorkspaceBuildStatus({
    studyId,
    enabled,
}: UseWorkspaceBuildStatusOptions): UseWorkspaceBuildStatusReturn {
    const cursorsRef = useRef<WorkspaceLaunchStatus['cursors'] | undefined>(undefined)

    // Reset cursors at the start of each polling session so a relaunch (new build, fresh log
    // id space) isn't filtered out by `?after=` ids left over from the previous build.
    useEffect(() => {
        if (enabled) cursorsRef.current = undefined
    }, [enabled])

    const query = useQuery({
        queryKey: ['workspace-build-status', studyId],
        enabled,
        refetchInterval: (q) =>
            q.state.data?.ready || q.state.data?.failed || q.state.error ? false : POLL_INTERVAL_MS,
        queryFn: async () => {
            const status = actionResult(await getWorkspaceLaunchStatusAction({ studyId, cursors: cursorsRef.current }))
            cursorsRef.current = status.cursors
            return status
        },
    })

    const status = query.data
    return {
        status,
        reason: status?.reason ?? null,
        lastLogAt: status?.lastLogAt ?? null,
        ready: status?.ready ?? false,
        failed: status?.failed ?? false,
        url: status?.url ?? null,
        error: query.error ?? null,
        isPolling: enabled && !status?.ready && !status?.failed && !query.error,
    }
}
