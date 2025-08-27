'use client'

import DashboardSkeleton from '@/components/layout/skeleton/dashboard'
import { useSession } from '@/hooks/session'
import { navigateToDashboard } from '@/lib/session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export const UserNav = () => {
    const { isLoaded, session } = useSession()
    const [isNavigating, setIsNavigating] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (!session) return

        setIsNavigating(true)
        navigateToDashboard(router, session)
    }, [session, router])

    // Show dashboard skeleton while session is loading or during navigation
    if (!isLoaded || isNavigating) {
        return <DashboardSkeleton />
    }
}
