'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'
import { useSession } from '@/hooks/session'

export default function PostHogUserProvider() {
    const { isLoaded, session } = useSession()

    useEffect(() => {
        if (isLoaded && session) {
            posthog.identify(session.user.id)
        }
    }, [isLoaded, session])

    return null
}
