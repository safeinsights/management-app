'use client'

import { useQuery } from '@/common'
import { codeEnvAuditMetadataSchema } from '@/lib/audit-diff'
import { isActionError } from '@/lib/errors'
import { fetchCodeEnvHistoryAction } from './code-envs.actions'
import type { CodeEnvHistoryEntry } from './code-env-history-view'

// metadata is jsonb, so it arrives typed as Json. Parsing it through the schema keeps that
// shape defined in one place rather than cast at each render site.
//
// safeParse rather than parse, inside queryFn rather than during render: audit rows outlive
// the code that wrote them, so a future shape change would otherwise throw out of the hook
// body, where TanStack cannot catch it — taking down the whole settings page instead of
// leaving one row unreadable. A row that fails the schema degrades to "no field changes"
// and keeps the rest of the history visible.
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
        // Thrown rather than filtered out: a denied or failed fetch has to reach query.isError,
        // otherwise it arrives as an empty list and renders as "no changes recorded" — the
        // opposite of what happened.
        queryFn: async () => {
            const result = await fetchCodeEnvHistoryAction({ orgSlug, codeEnvId })
            if (isActionError(result)) throw new Error('Failed to load code environment history')
            return result.map(toEntry)
        },
    })

    return { entries: query.data ?? [], isLoading: query.isLoading, isError: query.isError }
}
