import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { useOrgInfo } from './org-info'
import { useMemo } from 'react'
import { AuthRole } from '@/lib/types'

export const useAuthInfo = () => {
    const { isLoaded: authLoaded, userId } = clerkUseAuth()
    const { isLoaded: orgLoaded, org } = useOrgInfo()

    return useMemo(
        () => ({
            isLoaded: Boolean(authLoaded && orgLoaded),
            userId,
            orgSlug: org?.slug,
            ...org,
            role: org.isAdmin
                ? AuthRole.Admin
                : org.isReviewer
                  ? AuthRole.Reviewer
                  : org.isResearcher
                    ? AuthRole.Researcher
                    : null,
        }),
        [authLoaded, orgLoaded, userId, org],
    )
}

type ProtectProps = {
    role: AuthRole
    orgSlug?: string
    children: React.ReactNode
}

export const Protect: React.FC<ProtectProps> = ({ role, orgSlug, children }) => {
    const { isLoaded, org } = useOrgInfo(orgSlug)

    if (!isLoaded) return null

    if (role == AuthRole.Admin && org.isAdmin) return children
    if (role == AuthRole.Researcher && org.isResearcher) return children
    if (role == AuthRole.Reviewer && org.isReviewer) return children

    return null
}
