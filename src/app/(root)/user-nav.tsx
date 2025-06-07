'use client'

import { useEffect } from 'react'
import { LoadingOverlay } from '@mantine/core'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { useAuthInfo } from '@/components/auth'
import { useRouter } from 'next/navigation'

export const UserNav = () => {
    const auth = useAuthInfo()
    const router = useRouter()

    useEffect(() => {
        if (!auth.isLoaded) return

        if (auth.isReviewer && auth.preferredOrgSlug) {
            router.push(`/reviewer/${auth.preferredOrgSlug}/dashboard`) // Redirect to the Reviewer dashboard
        } else if (auth.isResearcher) {
            router.push('/researcher/dashboard') // Redirect to the Researcher dashboard
        } else if (auth.isAdmin) {
            if (auth.preferredOrgSlug === CLERK_ADMIN_ORG_SLUG) {
                router.push(`/admin/safeinsights`)
            } else {
                router.push(`/admin/team/${auth.orgSlug}`) // Redirect to the Admin dashboard
            }
        }
    }, [auth, router])

    if (!auth.isLoaded) {
        return <LoadingOverlay />
    }
    return null
}
