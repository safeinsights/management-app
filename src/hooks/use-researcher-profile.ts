'use client'

import { useQuery } from '@/common'
import { getResearcherProfileAction } from '@/server/actions/researcher-profile.actions'
import { queryKeys } from '@/lib/query-keys'

export function useResearcherProfile() {
    const query = useQuery({
        queryKey: queryKeys.researcherProfile(),
        queryFn: async () => getResearcherProfileAction(),
    })

    const data = query.data && 'error' in query.data ? null : (query.data ?? null)

    return {
        data,
        isLoading: query.isLoading,
    }
}

export type ResearcherProfileData = NonNullable<ReturnType<typeof useResearcherProfile>['data']>
