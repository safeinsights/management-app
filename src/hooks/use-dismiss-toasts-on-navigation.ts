'use client'

import { staleToastIds } from '@/components/toast-notifications'
import { notifications, notificationsStore } from '@mantine/notifications'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

// Long enough to cover the gap between a toast and the redirect it belongs to — the sign-in invite
// branch runs five sequential round-trips before its push — and short enough that a toast the
// reader has been looking at counts as stale.
export const TOAST_NAVIGATION_GRACE_MS = 3_000

export function useDismissToastsOnNavigation() {
    const pathname = usePathname()
    const previousPathname = useRef(pathname)

    useEffect(() => {
        if (previousPathname.current === pathname) return
        previousPathname.current = pathname

        // The queue holds toasts raised but not yet on screen; they are as stale as the visible ones.
        const { notifications: shown, queue } = notificationsStore.getState()

        for (const id of staleToastIds([...shown, ...queue], TOAST_NAVIGATION_GRACE_MS)) {
            notifications.hide(id)
        }
    }, [pathname])
}
