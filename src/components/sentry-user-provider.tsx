'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as Sentry from '@sentry/nextjs'

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
