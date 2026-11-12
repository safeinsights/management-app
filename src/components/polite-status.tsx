'use client'

import { FC, Fragment, useState } from 'react'
import { VisuallyHidden } from '@mantine/core'

export type Announcement = { text: string; id: number }

// Each announce() is a new event even when its text repeats, so two runs with the same date are
// both read out.
export function useAnnouncement() {
    const [announcement, setAnnouncement] = useState<Announcement>({ text: '', id: 0 })
    const announce = (text: string) => setAnnouncement((current) => ({ text, id: current.id + 1 }))
    return [announcement, announce] as const
}

// A new text node per announcement: VoiceOver in Safari can skip text that only changes in place.
export const PoliteStatus: FC<{ announcement: Announcement }> = ({ announcement }) => (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        <Fragment key={announcement.id}>{announcement.text}</Fragment>
    </VisuallyHidden>
)
