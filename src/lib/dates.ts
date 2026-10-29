import dayjs from 'dayjs'

export const DISPLAY_FORMAT = 'MMM DD, YYYY'

export const DATE_TIME_FORMAT = 'MMM DD, YYYY, hh:mm a'

export const EMPTY_CELL = '—'

export const formatInstant = (value: Date | string | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)

// signedAt stays a bare YYYY-MM-DD string end to end so it never meets a timezone; parsing
// here is local-only and cannot shift the day.
export const formatDayString = (value: string | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)

// UTC, so two users never see a document as effective on different days. Re-wrapped because a
// timestamp crossing a server action can arrive as an ISO string.
export const formatInstantAsUtcDay = (value: Date | string | null) =>
    value ? formatDayString(new Date(value).toISOString().slice(0, 10)) : EMPTY_CELL

// Emails have no browser to localize in, so they name the zone instead.
export const formatInstantAsUtcDayLabel = (value: Date | string) => `${formatInstantAsUtcDay(value)} (UTC)`
