'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

/**
 * This component ensures that the Sentry user context is set on the client-side.
 */
export default function SentryUserProvider() {
    const { userId, orgSlug } = useAuth()

    useEffect(() => {
        if (userId) {
            Sentry.setUser({
                id: userId,
            })
            if (orgSlug) {
                Sentry.setTag('org', orgSlug)
            }
        } else {
            Sentry.setUser(null)
        }
    }, [userId, orgSlug])

    return null
}
