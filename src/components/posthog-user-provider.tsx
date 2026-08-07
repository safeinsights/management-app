'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { useSession } from '@/hooks/session'

export default function PostHogUserProvider() {
    const { session } = useSession()
    const userId = session?.user.id

    useEffect(() => {
        if (userId) {
            posthog.identify(userId)
        }
    }, [userId])

    return null
}
