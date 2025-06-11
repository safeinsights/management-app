'use client'

import { useAuthInfo } from '@/components/auth'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

/**
 * Return the correct dashboard URL for the current signed-in user.
 * Falls back to “/” while auth info is still loading or no role found.
 */
export function useDashboardUrl(): string {
    const { isLoaded, isReviewer, isResearcher, isAdmin, preferredOrgSlug, orgSlug } = useAuthInfo()

    if (!isLoaded) return '/'

    if (isReviewer) {
        const slug = preferredOrgSlug ?? orgSlug
        if (slug) return `/reviewer/${slug}/dashboard`
    }
    if (isResearcher) return '/researcher/dashboard'

    if (isAdmin) {
        // SI admin or no org preference → try global admin page
        if (!preferredOrgSlug || preferredOrgSlug === CLERK_ADMIN_ORG_SLUG) return '/admin/safeinsights'
        // per-organization admin dashboard
        return `/admin/team/${preferredOrgSlug}`
    }

    return '/'
}
