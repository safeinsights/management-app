'use client'

import { Fragment } from 'react'
import { VisuallyHidden } from '@mantine/core'
import { useRouteAnnouncement } from '@/hooks/use-route-announcement'

// Speaks for Next's route announcer, which globals.css hides (OTTER-823). The key swaps in a new
// text node per title: VoiceOver in Safari often skips an alert whose text only changes in place.
export function RouteAnnouncer() {
    const announcement = useRouteAnnouncement()

    return (
        <VisuallyHidden role="alert" data-testid="route-announcer">
            <Fragment key={announcement}>{announcement}</Fragment>
        </VisuallyHidden>
    )
}
