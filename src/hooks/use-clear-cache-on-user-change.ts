'use client'

import { useAuth } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@/common'

export function useClearCacheOnUserChange() {
    const { userId } = useAuth()
    const queryClient = useQueryClient()
    const prevUserIdRef = useRef(userId)

    // Clear the React Query cache when the user changes (e.g. sign-out then
    // sign-in as a different user) so stale data from the previous session
    // doesn't leak across accounts.
    useEffect(() => {
        if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
            queryClient.clear()
        }
        prevUserIdRef.current = userId
    }, [userId, queryClient])
}
