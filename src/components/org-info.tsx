import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { useAuth, useUser } from '@clerk/nextjs'
import { useParams } from 'next/navigation'

export function useHasMultipleRoles() {
    const { user } = useUser()
    const dualRoleOrg = user?.publicMetadata?.orgs?.find((org) => org.isAdmin || (org.isResearcher && org.isReviewer))
    return !!dualRoleOrg
}

export function useOrgInfo(orgSlugFallback = '') {
    const { user, isLoaded } = useUser()
    const { orgSlug: currentOrgSlug } = useAuth()

    const { orgSlug: paramOrgSlug } = useParams<{ orgSlug: string }>()

    const orgs = user?.publicMetadata?.orgs || []
    const orgSlug = paramOrgSlug || orgSlugFallback || currentOrgSlug || orgs[0]?.slug
    const org = orgs.find((org) => org.slug == orgSlug)
    const adminOrg = orgs.find((org) => org.slug == CLERK_ADMIN_ORG_SLUG)

    return {
        isLoaded,
        orgSlug,
        org: { ...org, isAdmin: org?.isAdmin || adminOrg },
    }
}
