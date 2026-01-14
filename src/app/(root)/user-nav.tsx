'use client'

import DashboardSkeleton from '@/components/layout/skeleton/dashboard'
import { useSession } from '@/hooks/session'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Routes } from '@/lib/routes'

export const UserNav = () => {
    const { isLoaded, session } = useSession()
    const [isNavigating, setIsNavigating] = useState(false)
    const router = useRouter()

    useEffect(() => {
        if (!session) return
        // TODO: investigate if this is an issue, disable was added during upgrading eslint which pointed out possible errors
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsNavigating(true)
        router.push(Routes.dashboard)
    }, [session, router])

    // Show dashboard skeleton while session is loading or during navigation
    if (!isLoaded || isNavigating) {
        return <DashboardSkeleton />
    }
}
