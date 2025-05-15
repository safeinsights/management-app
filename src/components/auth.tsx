import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { useOrgInfo } from './org-info'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { useState, useEffect } from 'react'

export const useAuthInfo = () => {
    const { isLoaded: authLoaded, userId, orgSlug } = clerkUseAuth()
    const { isLoaded: orgLoaded, org } = useOrgInfo()
    const [hasReviewerKey, setHasReviewerKey] = useState<boolean>(false)

    useEffect(() => {
        if (authLoaded && org.isReviewer && userId) {
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
    }, [authLoaded, org.isReviewer, userId])

    return {
        isLoaded: Boolean(authLoaded && orgLoaded),
        userId,
        orgSlug,
        ...org,
        role: org.isAdmin ? 'admin' : org.isReviewer ? 'reviewer' : org.isResearcher ? 'researcher' : null,
        hasReviewerKey,
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
