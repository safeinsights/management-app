'use client'

import { useEffect } from 'react'
import { LoadingOverlay } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/session'

export const UserNav = () => {
    const { isLoaded, session } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (!session) return

        if (session.team.isResearcher) {
            router.push('/researcher/dashboard')
        } else if (session.team.isReviewer) {
            router.push(`/reviewer/${session.team.slug}/dashboard`)
        }
    }, [session, router])

    if (!isLoaded) {
        return <LoadingOverlay />
    }
    return null
}
