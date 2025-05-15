import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { useState, useEffect } from 'react'

export const useAuthInfo = () => {
    const { isLoaded, userId, orgSlug } = clerkUseAuth()
    const isAdmin = orgSlug == CLERK_ADMIN_ORG_SLUG
    const isReviewer = orgSlug && !isAdmin
    const isResearcher = !orgSlug && !isAdmin
    const [hasReviewerKey, setHasReviewerKey] = useState<boolean>(false)

    useEffect(() => {
        if (isLoaded && isReviewer && userId) {
            // Only fetch if user is loaded, is a reviewer, and userId is available
            getReviewerPublicKeyAction()
                .then((publicKey) => {
                    setHasReviewerKey(Boolean(publicKey))
                })
                .catch((error) => {
                    console.error('Error fetching reviewer public key:', error)
                    setHasReviewerKey(false)
                })
        }
    }, [isLoaded, isReviewer, userId])

    return {
        isLoaded,
        userId,
        orgSlug,
        isReviewer,
        isAdmin,
        isResearcher,
        role: isAdmin ? 'admin' : isReviewer ? 'reviewer' : 'researcher',
        hasReviewerKey,
    }
}
