import { useEffect } from 'react'
import posthog from 'posthog-js'
import { POSTHOG_HOST } from '@/lib/constants'
import { expireParentDomainPostHogCookie } from '@/lib/posthog-cookie'

let initialized = false

export function usePostHogInit(projectToken: string) {
    useEffect(() => {
        if (!projectToken || initialized) return
        initialized = true
        // Before init, which reads the cookie and would otherwise pick up the stale parent-domain copy.
        expireParentDomainPostHogCookie(projectToken)
        posthog.init(projectToken, {
            api_host: POSTHOG_HOST,
            defaults: '2026-05-30',
            // Each environment is its own project, yet a parent-domain cookie reached all of them and
            // pushed server action headers past the origin limit (OTTER-797).
            cross_subdomain_cookie: false,
            debug: process.env.NODE_ENV === 'development',
        })
    }, [projectToken])
}
