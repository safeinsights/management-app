'use client'

import { useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '../hooks/session'

export const RequireOrgAdmin = () => {
    const { session } = useSession()
    const router = useRouter()

    useLayoutEffect(() => {
        if (!session || session.team.isAdmin) return

        if (session.team.isResearcher) {
            router.push('/researcher/dashboard')
        } else if (session.team.isReviewer) {
            router.push(`/reviewer/${session.team.slug}/dashboard`)
        }
    }, [session, router])

    return null
}
