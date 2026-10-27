'use client'

import { VisuallyHidden } from '@mantine/core'
import { useRouteAnnouncement } from '@/hooks/use-route-announcement'

// Speaks for Next's route announcer, which globals.css hides (OTTER-823).
export function RouteAnnouncer() {
    const announcement = useRouteAnnouncement()

    return (
        <VisuallyHidden role="alert" data-testid="route-announcer">
            {announcement}
        </VisuallyHidden>
    )
}
