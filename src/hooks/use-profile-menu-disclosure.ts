'use client'

import { Routes } from '@/lib/routes'
import { useDisclosure } from '@mantine/hooks'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback } from 'react'

const PINNED_ROUTES: string[] = [
    Routes.researcherProfile,
    Routes.userKey,
    Routes.adminSafeinsights,
    Routes.adminSafeinsightsLegal,
]

// On profile-related pages the menu stays open and cannot be dismissed by an outside click.
export function useProfileMenuDisclosure() {
    const pathname = usePathname()
    const isOnPinnedRoute = PINNED_ROUTES.includes(pathname)
    const [opened, { toggle, close, open }] = useDisclosure(isOnPinnedRoute)

    useEffect(() => {
        if (isOnPinnedRoute) {
            open()
        }
    }, [isOnPinnedRoute, open])

    const handleClickOutside = useCallback(() => {
        if (opened && !isOnPinnedRoute) {
            close()
        }
    }, [opened, isOnPinnedRoute, close])

    const closeForNavigation = useCallback(
        (destinationRoute: string) => {
            if (!PINNED_ROUTES.includes(destinationRoute)) {
                close()
            }
        },
        [close],
    )

    return {
        opened,
        toggle,
        close,
        pathname,
        handleClickOutside,
        closeForNavigation,
    }
}
