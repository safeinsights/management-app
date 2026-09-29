'use client'

import { useUser } from '@clerk/nextjs'
import { useQuery } from '@/common'
import { getStudyCapableEnclaveOrgsAction } from '@/server/actions/org.actions'

export function useStudyCapableOrgs() {
    const { user, isLoaded } = useUser()
    const isSessionReady = isLoaded && !!user

    const { data: orgs = [], isLoading } = useQuery({
        queryKey: ['orgs-with-languages'],
        queryFn: () => getStudyCapableEnclaveOrgsAction(),
        // The action's ability check needs a resolved Clerk session.
        enabled: isSessionReady,
    })

    return { orgs, isLoading, isSessionReady }
}
