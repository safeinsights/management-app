'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@/common'
import { isActionError } from '@/lib/errors'
import { fetchOrgDataSourcesAction } from '@/app/[orgSlug]/admin/settings/data-sources.actions'

export function useOrgDataSources(orgSlugOverride?: string) {
    const params = useParams<{ orgSlug: string }>()
    const orgSlug = orgSlugOverride || params.orgSlug

    const query = useQuery({
        queryKey: ['org-data-sources', orgSlug],
        queryFn: () => fetchOrgDataSourcesAction({ orgSlug }),
        enabled: !!orgSlug,
    })

    const dataSources = query.data && !isActionError(query.data) ? query.data : []
    const options = dataSources.map((ds) => ({ value: ds.id, label: ds.name }))

    return { options, isLoading: query.isLoading }
}
