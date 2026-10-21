'use client'

import { useEffect, useEffectEvent } from 'react'
import { useUser } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'

// The proxy already bounces signed-out requests; this covers a session that ends client-side.
export function useRequireUser() {
    const { isLoaded, user } = useUser()
    const router = useRouter()
    const isSignedOut = isLoaded && !user

    const sendHome = useEffectEvent(() => {
        notifications.show({ message: 'You must be logged in to access this page', color: 'blue' })
        router.replace(Routes.home)
    })

    useEffect(() => {
        if (isSignedOut) sendHome()
    }, [isSignedOut])

    return { isLoaded, user: user ?? null }
}
