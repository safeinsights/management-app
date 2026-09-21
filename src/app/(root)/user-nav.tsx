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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsNavigating(true)
        router.push(Routes.dashboard)
    }, [session, router])

    if (!isLoaded || isNavigating) {
        return <DashboardSkeleton />
    }
}
