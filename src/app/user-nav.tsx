'use client'

import { LoadingOverlay } from '@mantine/core'
import { useAuthInfo } from '@/components/auth'
import { useRouter } from 'next/navigation'

export const UserNav = () => {
    const auth = useAuthInfo()
    const router = useRouter()

    if (auth.isLoaded) {
        if (auth.isResearcher) {
            router.push('/researcher/dashboard') // Redirect to the Researcher dashboard
        } else if (auth.isMember) {
            router.push(`/member/${auth.orgSlug}/dashboard`) // Redirect to the Member dashboard
        } else if (auth.isAdmin) {
            router.push('/admin/members') // Redirect to the Admin dashboard
        }
    }

    if (!auth.isLoaded) {
        return <LoadingOverlay />
    }
}
