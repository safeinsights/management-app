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

        // Read here rather than at render time: a toast raised between commit and this flush would
        // be missing from a captured snapshot, and pruning its entry leaves it undismissable.
        // The queue counts as live for the same reason — it holds toasts not yet on screen.
        const { notifications: shown, queue } = notificationsStore.getState()
        const liveIds = [...shown, ...queue].map(({ id }) => id).filter((id): id is string => !!id)

        for (const id of staleToastIds(liveIds, TOAST_NAVIGATION_GRACE_MS)) {
            notifications.hide(id)
        }
    }, [pathname])
}
