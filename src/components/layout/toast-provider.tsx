'use client'

import { useDismissToastsOnNavigation } from '@/hooks/use-dismiss-toasts-on-navigation'
import { Notifications } from '@mantine/notifications'

export function ToastProvider() {
    useDismissToastsOnNavigation()

    return (
        <Notifications
            position="top-right"
            limit={3}
            zIndex={700}
            containerWidth={400}
            autoClose={12_000}
            notificationMaxHeight={600}
        />
    )
}
