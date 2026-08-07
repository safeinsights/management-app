'use client'

import { useQuery } from '@/common'
import { isActionError } from '@/lib/errors'
import { getResearcherProfileByUserIdAction } from '@/server/actions/researcher-profile.actions'

export function useResearcherPopoverProfile(userId: string, studyId: string) {
    const query = useQuery({
        // studyId is part of the key because the action authorizes per study: sharing one entry
        // across studies would serve a result the current study never granted.
        queryKey: ['researcher-profile', userId, studyId],
        queryFn: () => getResearcherProfileByUserIdAction({ userId, studyId }),
    })

    const data = query.data && !isActionError(query.data) ? query.data : null
    const fullName = data ? [data.user.firstName, data.user.lastName].filter(Boolean).join(' ') : ''
    const firstPosition = data?.positions[0] ?? null
    const hasProfile = data?.profile !== null

    return { data, isLoading: query.isLoading, fullName, firstPosition, hasProfile }
}
