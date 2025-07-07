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
        const isSiAdmin = !!user?.organizationMemberships.find(
            (membership) => membership.organization.slug === CLERK_ADMIN_ORG_SLUG,
        )

        const orgs = user?.publicMetadata?.orgs || []
        const orgSlug = paramOrgSlug || orgSlugFallback || currentOrgSlug

        // If there's no active organization slug, we are in the researcher context.
        if (!orgSlug) {
            return {
                isLoaded,
                orgSlug: orgs[0]?.slug, // default to the first org if no org slug is provided
                preferredOrgSlug: null,
                org: {
                    isResearcher: true,
                    isReviewer: false, // ensure a researcher does not have access to reviewer context such as the reviewer key nav option
                    isAdmin: isSiAdmin,
                },
            }
        }

        const org = orgs.find((org) => org.slug == orgSlug)

        return {
            isLoaded,
            orgSlug,
            preferredOrgSlug: paramOrgSlug || currentOrgSlug, // preferred is what the user has indicated a preference for,  either via url or org switcher
            org: { ...org, isAdmin: org?.isAdmin || isSiAdmin },
        }
    }, [isLoaded, user, currentOrgSlug, paramOrgSlug, orgSlugFallback])
}
