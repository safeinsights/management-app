'use client'

import dayjs from 'dayjs'
import { useIsHydrated } from '@/hooks/use-is-hydrated'
import { DISPLAY_FORMAT } from '@/lib/dates'

type LocalDateTimeProps = {
    value: Date | string | number
    format?: string
    /** Shown with the date, outside the time element, e.g. a " • " separator. */
    prefix?: string
}

// The server renders in UTC, so the text waits for the browser's zone; the server HTML carries
// only the instant.
export function LocalDateTime({ value, format = DISPLAY_FORMAT, prefix }: LocalDateTimeProps) {
    const isHydrated = useIsHydrated()
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null

    const text = isHydrated ? dayjs(date).format(format) : null
    const shownPrefix = isHydrated ? prefix : null

    return (
        <>
            {shownPrefix}
            <time dateTime={date.toISOString()}>{text}</time>
        </>
    )
}
