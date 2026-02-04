'use client'

import { Routes } from '@/lib/routes'
import { useDisclosure } from '@mantine/hooks'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback } from 'react'

const PINNED_ROUTES: string[] = [Routes.researcherProfile, Routes.reviewerKey, Routes.adminSafeinsights]

/**
 * Manages profile menu disclosure state with special behavior:
 * - Menu stays open while on profile-related pages (researcher profile, reviewer key, SI admin)
 * - Menu cannot be closed by clicking outside while on those pages
 */
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
