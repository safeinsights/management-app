import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

export const useAuthInfo = () => {
    const { isLoaded, userId, orgSlug } = clerkUseAuth()
    const isAdmin = orgSlug == CLERK_ADMIN_ORG_SLUG
    const isReviewer = orgSlug && !isAdmin
    const isResearcher = !orgSlug && !isAdmin
    return {
        isLoaded,
        userId,
        orgSlug,
        isReviewer,
        isAdmin,
        isResearcher,
        role: isAdmin ? 'admin' : isReviewer ? 'reviewer' : 'researcher',
    }
}
