'use client'

import DashboardSkeleton from '@/components/layout/skeleton/dashboard'
import { useSession } from '@/hooks/session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export const dynamic = 'force-dynamic'

export default function Home() {
    const { isLoaded, session } = useSession()
    const [isNavigating, setIsNavigating] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (!session) return

        setIsNavigating(true)
        if (session.team.isResearcher) {
            router.push('/researcher/dashboard')
        } else if (session.team.isReviewer) {
            router.push(`/reviewer/${session.team.slug}/dashboard`)
        }
    }, [session, router])

    // Show dashboard skeleton while session is loading or during navigation
    if (!isLoaded || isNavigating) {
        return <DashboardSkeleton />
    }
}
