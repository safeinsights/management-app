import dayjs from 'dayjs'

const DISPLAY_FORMAT = 'MMM DD, YYYY'

export const EMPTY_CELL = '—'

export const formatInstant = (value: Date | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)

// signedAt stays a bare YYYY-MM-DD string end to end so it never meets a timezone; parsing
// here is local-only and cannot shift the day.
export const formatDayString = (value: string | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)

// UTC, so two users never see a document as effective on different days. Re-wrapped because a
// timestamp crossing a server action can arrive as an ISO string.
export const formatInstantAsUtcDay = (value: Date | null) =>
    value ? formatDayString(new Date(value).toISOString().slice(0, 10)) : EMPTY_CELL
