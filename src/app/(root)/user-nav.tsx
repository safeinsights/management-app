'use client'

import { useEffect } from 'react'
import { LoadingOverlay } from '@mantine/core'
import { useAuthInfo } from '@/components/auth'
import { useRouter, usePathname } from 'next/navigation'
import { useDashboardUrl } from '@/lib/dashboard-url'

export const UserNav = () => {
    const auth = useAuthInfo()
    const router = useRouter()
    const pathname = usePathname()
    const dashUrl = useDashboardUrl()

    useEffect(() => {
        if (!auth.isLoaded) return
        if (pathname !== dashUrl) router.push(dashUrl)
    }, [auth.isLoaded, pathname, dashUrl, router])

    if (!auth.isLoaded) {
        return <LoadingOverlay />
    }
    return null
}
