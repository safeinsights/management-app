'use client'

import { useQuery } from '@/common'
import { getResearcherProfileAction } from '@/server/actions/researcher-profile.actions'

export function useResearcherProfile() {
    const query = useQuery({
        queryKey: ['researcher-profile'],
        queryFn: async () => getResearcherProfileAction(),
    })

    const data = query.data && 'error' in query.data ? null : (query.data ?? null)

    return {
        data,
        isLoading: query.isLoading,
        refetch: query.refetch,
    }
}

export type ResearcherProfileData = NonNullable<ReturnType<typeof useResearcherProfile>['data']>
