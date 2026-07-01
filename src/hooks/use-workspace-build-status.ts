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
    /** Local time a new build/agent log line last arrived, for the "last updated … ago" hint */
    lastUpdatedAt: Date | null
    /** Full build/agent logs accumulated across polls from each batch of new lines */
    buildLog: string
    agentLog: string
    ready: boolean
    failed: boolean
    url: string | null
    error: Error | null
    isPolling: boolean
}

const POLL_INTERVAL_MS = 5000

// Append a poll's new log lines to the accumulated log, keeping one line per entry.
const appendLines = (existing: string, lines: string[]): string =>
    lines.length === 0 ? existing : existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n')

// Client-side cursor state carried across polls: the wire cursors (last log id seen per stream), the
// accumulated build/agent logs, and the local time a new line last arrived. None of this is sent to
// the server beyond the cursor counters.
interface CursorState {
    build: number | null
    agent: number | null
    lastUpdated: Date | null
    buildLog: string
    agentLog: string
}

// Polls the combined Coder build/agent status for a study's workspace. Carries per-source log
// cursors across refetches (via a ref, not the query key) so steady-state polls only pull new
// log lines, and stops polling once the launch reaches a terminal state.
export function useWorkspaceBuildStatus({
    studyId,
    enabled,
}: UseWorkspaceBuildStatusOptions): UseWorkspaceBuildStatusReturn {
    const cursorsRef = useRef<CursorState | undefined>(undefined)

    // Reset cursors at the start of each polling session so a relaunch (new build, fresh log
    // id space) isn't filtered out by `?after=` ids left over from the previous build.
    useEffect(() => {
        if (enabled) cursorsRef.current = undefined
    }, [enabled])

    const query = useQuery({
        queryKey: ['workspace-build-status', studyId],
        enabled,
        // Return a fresh reference every poll (even when a poll adds no new log lines) so the UI
        // re-renders each interval, keeping the "time remaining" and "updated … ago" hints current.
        structuralSharing: false,
        refetchInterval: (q) =>
            q.state.data?.status.ready || q.state.data?.status.failed || q.state.error ? false : POLL_INTERVAL_MS,
        queryFn: async () => {
            const prev = cursorsRef.current
            const status = actionResult(
                await getWorkspaceLaunchStatusAction({
                    studyId,
                    cursors: prev ? { build: prev.build, agent: prev.agent } : undefined,
                }),
            )
            // Stamp lastUpdated whenever this poll pulled new build or agent log lines.
            const newLines = status.buildLogLines.length > 0 || status.agentLogLines.length > 0
            const lastUpdated = newLines ? new Date() : (prev?.lastUpdated ?? null)
            const buildLog = appendLines(prev?.buildLog ?? '', status.buildLogLines)
            const agentLog = appendLines(prev?.agentLog ?? '', status.agentLogLines)
            cursorsRef.current = {
                build: status.cursors.build,
                agent: status.cursors.agent,
                lastUpdated,
                buildLog,
                agentLog,
            }
            // Derived values ride along in the cached data (not the ref) so the UI re-renders.
            return { status, lastUpdatedAt: lastUpdated, buildLog, agentLog }
        },
    })

    const status = query.data?.status
    return {
        status,
        reason: status?.reason ?? null,
        lastUpdatedAt: query.data?.lastUpdatedAt ?? null,
        buildLog: query.data?.buildLog ?? '',
        agentLog: query.data?.agentLog ?? '',
        ready: status?.ready ?? false,
        failed: status?.failed ?? false,
        url: status?.url ?? null,
        error: query.error ?? null,
        isPolling: enabled && !status?.ready && !status?.failed && !query.error,
    }
}
