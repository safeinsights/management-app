import { useAuth as clerkUseAuth } from '@clerk/nextjs'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { useEffect, useState } from 'react'
import { getCurrentOrgUserAdminStatusAction } from '@/server/actions/user.actions'

export const useAuthInfo = () => {
    const { isLoaded: clerkIsLoaded, userId: clerkUserId, orgSlug } = clerkUseAuth()
    const [isOrgAdmin, setIsOrgAdmin] = useState(false)
    const [isOrgAdminLoading, setIsOrgAdminLoading] = useState(true)

    const isAdmin = orgSlug === CLERK_ADMIN_ORG_SLUG
    const isReviewer = orgSlug && !isAdmin
    const isResearcher = !orgSlug && !isAdmin

    useEffect(() => {
        if (clerkIsLoaded) {
            if (orgSlug && orgSlug !== CLERK_ADMIN_ORG_SLUG) {
                setIsOrgAdminLoading(true)
                getCurrentOrgUserAdminStatusAction({ orgSlug })
                    .then((status) => {
                        setIsOrgAdmin(status)
                    })
                    .catch((error) => {
                        console.error('Failed to fetch org admin status:', error)
                        setIsOrgAdmin(false)
                    })
                    .finally(() => {
                        setIsOrgAdminLoading(false)
                    })
            } else {
                setIsOrgAdmin(false)
                setIsOrgAdminLoading(false)
            }
        }
    }, [clerkIsLoaded, orgSlug])

    return {
        isLoaded: clerkIsLoaded && !isOrgAdminLoading,
        userId: clerkUserId,
        orgSlug,
        isReviewer,
        isAdmin,
        isResearcher,
        isOrgAdmin,
        role: isAdmin ? 'admin' : isReviewer ? 'reviewer' : isResearcher ? 'researcher' : 'unknown',
    }
}
