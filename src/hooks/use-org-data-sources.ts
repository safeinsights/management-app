'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@/common'
import { isActionError } from '@/lib/errors'
import { fetchOrgDataSourcesAction } from '@/server/actions/data-sources.actions'

export const orgDataSourcesQueryKey = (orgSlug: string) => ['orgDataSources', orgSlug]

export function useOrgDataSources(orgSlugOverride?: string) {
    const params = useParams<{ orgSlug: string }>()
    const orgSlug = orgSlugOverride || params.orgSlug

    const query = useQuery({
        queryKey: orgDataSourcesQueryKey(orgSlug),
        queryFn: () => fetchOrgDataSourcesAction({ orgSlug }),
        enabled: !!orgSlug,
    })

    const dataSources = query.data && !isActionError(query.data) ? query.data : []
    const options = dataSources.map((ds) => ({ value: ds.id, label: ds.name }))

    return { options, isLoading: query.isLoading }
}
