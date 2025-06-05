import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { useAuth, useUser } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

export function useHasMultipleRoles() {
    const { user } = useUser()
    const dualRoleOrg = user?.publicMetadata?.orgs?.find((org) => org.isAdmin || (org.isResearcher && org.isReviewer))
    return !!dualRoleOrg
}

export function useOrgInfo(orgSlugFallback = '') {
    const { user, isLoaded } = useUser()
    const { orgSlug: currentOrgSlug } = useAuth()
    const { orgSlug: paramOrgSlug } = useParams<{ orgSlug: string }>()

    return useMemo(() => {
        const orgs = user?.publicMetadata?.orgs || []
        const orgSlug = paramOrgSlug || orgSlugFallback || currentOrgSlug || orgs[0]?.slug

        const org = orgs.find((org) => org.slug == orgSlug)
        const adminOrg = user?.organizationMemberships.find(
            (membership) => membership.organization.slug == CLERK_ADMIN_ORG_SLUG,
        )

        return {
            isLoaded,
            orgSlug,
            preferredOrgSlug: paramOrgSlug || currentOrgSlug, // preferred is what the user has indicated a preference for,  either via url or org switcher
            org: { ...org, isAdmin: org?.isAdmin || !!adminOrg },
        }
    }, [isLoaded, user, currentOrgSlug, paramOrgSlug, orgSlugFallback])
}
