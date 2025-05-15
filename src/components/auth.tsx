import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { useOrgInfo } from './org-info'

export const useAuthInfo = () => {
    const { isLoaded: authLoaded, userId, orgSlug } = clerkUseAuth()
    const { isLoaded: orgLoaded, org } = useOrgInfo()

    return {
        isLoaded: Boolean(authLoaded && orgLoaded),
        userId,
        orgSlug,
        ...org,
        role: org.isAdmin ? 'admin' : org.isReviewer ? 'reviewer' : org.isResearcher ? 'researcher' : null,
    }
}

type ProtectProps = {
    role: 'admin' | 'reviewer' | 'researcher'
    orgSlug?: string
    children: React.ReactNode
}

export const Protect: React.FC<ProtectProps> = ({ role, orgSlug, children }) => {
    const { isLoaded, org } = useOrgInfo(orgSlug)

    if (!isLoaded) return null

    if (role == 'admin' && org.isAdmin) return children
    if (role == 'researcher' && org.isResearcher) return children
    if (role == 'reviewer' && org.isReviewer) return children

    return null
}
