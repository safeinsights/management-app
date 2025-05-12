import { useUser } from '@clerk/nextjs'
import { useParams } from 'next/navigation'

export function useHasMultipleRoles() {
    const { user } = useUser()
    const dualRoleOrg = user?.publicMetadata?.orgs?.find((org) => org.isAdmin || (org.isResearcher && org.isReviewer))
    return !!dualRoleOrg
}

export function useOrgInfo(orgSlugFallback = '') {
    const { user, isLoaded } = useUser()

    const { orgSlug: paramOrgSlug } = useParams<{ orgSlug: string }>()

    const org = user?.publicMetadata?.orgs?.find((org) => org.slug == (paramOrgSlug || orgSlugFallback))

    return {
        isLoaded,
        org,
    }
}
