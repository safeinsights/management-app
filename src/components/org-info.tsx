import { useUser } from '@clerk/nextjs'

export function useHasMultipleRoles() {
    const { user } = useUser()
    const dualRoleOrg = user?.publicMetadata?.orgs.find((org) => org.isAdmin || (org.isResearcher && org.isReviewer))
    return !!dualRoleOrg
}
