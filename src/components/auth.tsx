import { useAuth as clerkUseAuth } from '@clerk/nextjs'

export const useAuthInfo = () => {
    const { isLoaded, userId, orgSlug } = clerkUseAuth()
    const isAdmin = orgSlug == 'safe-insights'
    const isMember = orgSlug && !isAdmin
    const isResearcher = !orgSlug && !isAdmin
    return {
        isLoaded,
        userId,
        orgSlug,
        isMember,
        isAdmin,
        isResearcher,
        role: isAdmin ? 'admin' : isMember ? 'member' : 'researcher',
    }
}
