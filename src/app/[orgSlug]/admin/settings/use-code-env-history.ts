'use client'

import { useQuery } from '@/common'
import { codeEnvAuditMetadataSchema } from '@/lib/audit-diff'
import { isActionError } from '@/lib/errors'
import { fetchCodeEnvHistoryAction } from './code-envs.actions'
import type { CodeEnvHistoryEntry } from './code-env-history-view'

// safeParse inside queryFn, not parse during render: audit rows outlive the code that wrote them,
// and a throw from the hook body would take down the whole settings page.
const toEntry = (entry: {
    id: string
    createdAt: Date
    eventType: CodeEnvHistoryEntry['eventType']
    userFullName: string | null
    metadata: unknown
}): CodeEnvHistoryEntry => {
    const parsed = codeEnvAuditMetadataSchema.safeParse(entry.metadata ?? {})

    return {
        id: entry.id,
        createdAt: entry.createdAt,
        eventType: entry.eventType,
        userFullName: entry.userFullName,
        metadata: parsed.success ? parsed.data : { changes: [] },
    }
}

export const useCodeEnvHistory = (orgSlug: string, codeEnvId: string, enabled: boolean) => {
    const query = useQuery({
        queryKey: ['codeEnvHistory', orgSlug, codeEnvId],
        enabled,
        // Thrown rather than filtered out: a failed fetch must reach query.isError, not render as
        // "no changes recorded".
        queryFn: async () => {
            const result = await fetchCodeEnvHistoryAction({ orgSlug, codeEnvId })
            if (isActionError(result)) throw new Error('Failed to load code environment history')
            return result.map(toEntry)
        },
    })

    return { entries: query.data ?? [], isLoading: query.isLoading, isError: query.isError }
}
