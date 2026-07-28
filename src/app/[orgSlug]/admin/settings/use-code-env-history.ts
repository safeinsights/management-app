'use client'

import { useQuery } from '@/common'
import { codeEnvAuditMetadataSchema } from '@/lib/audit-diff'
import { fetchCodeEnvHistoryAction } from './code-envs.actions'
import type { CodeEnvHistoryEntry } from './code-env-history-view'

// metadata is jsonb, so it arrives typed as Json. Parsing it through the schema here
// keeps that shape defined in one place rather than cast at each render site; entries
// written before a field was added still parse, since every key is optional or defaulted.
export const useCodeEnvHistory = (orgSlug: string, codeEnvId: string, enabled: boolean) => {
    const query = useQuery({
        queryKey: ['codeEnvHistory', orgSlug, codeEnvId],
        enabled,
        queryFn: async () => await fetchCodeEnvHistoryAction({ orgSlug, codeEnvId }),
    })

    const entries: CodeEnvHistoryEntry[] = (query.data ?? []).map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        eventType: entry.eventType,
        userFullName: entry.userFullName,
        metadata: codeEnvAuditMetadataSchema.parse(entry.metadata ?? {}),
    }))

    return { entries, isLoading: query.isLoading }
}
