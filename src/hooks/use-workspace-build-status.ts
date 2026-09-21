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
    lastUpdatedAt: Date | null
    buildLog: string
    agentLog: string
    ready: boolean
    failed: boolean
    url: string | null
    error: Error | null
    isPolling: boolean
}

const POLL_INTERVAL_MS = 5000

const appendLines = (existing: string, lines: string[]): string =>
    lines.length === 0 ? existing : existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n')

interface CursorState {
    build: number | null
    agent: number | null
    lastUpdated: Date | null
    buildLog: string
    agentLog: string
}

// Cursors ride a ref rather than the query key so steady-state polls only pull new log lines.
export function useWorkspaceBuildStatus({
    studyId,
    enabled,
}: UseWorkspaceBuildStatusOptions): UseWorkspaceBuildStatusReturn {
    const cursorsRef = useRef<CursorState | undefined>(undefined)

    // Reset per session, or a relaunch's fresh log id space is filtered out by stale `?after=` ids.
    useEffect(() => {
        if (enabled) cursorsRef.current = undefined
    }, [enabled])

    const query = useQuery({
        queryKey: ['workspace-build-status', studyId],
        enabled,
        // A fresh reference every poll, so the relative-time hints re-render even when no new log
        // lines arrived.
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
            // Derived values ride in the cached data rather than the ref, so the UI re-renders.
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
