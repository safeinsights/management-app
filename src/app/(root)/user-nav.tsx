'use client'

import { useEffect } from 'react'
import { LoadingOverlay } from '@mantine/core'
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
            router.push(`/admin/team/${auth.orgSlug}/admin`) // Redirect to the Admin dashboard
        }
    }, [auth, router])

    if (!auth.isLoaded) {
        return <LoadingOverlay />
    }
}
