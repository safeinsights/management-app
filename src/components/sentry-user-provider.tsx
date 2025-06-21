'use client'

import { useEffect } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

/**
 * This component ensures that the Sentry user context is set on the client-side.
 *
 * It should be placed in a central location, like the root layout, to run on every page load.
 */
export default function SentryUserProvider() {
    const { user } = useUser()
    const { orgSlug } = useAuth()

    useEffect(() => {
        if (user) {
            Sentry.setUser({
                id: user.id,
            })
            if (orgSlug) {
                Sentry.setTag('org', orgSlug)
            }
        } else {
            Sentry.setUser(null)
            Sentry.setTag('org', '')
        }
    }, [user, orgSlug])

    return null
}
