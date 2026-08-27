import dayjs from 'dayjs'

const DISPLAY_FORMAT = 'MMM DD, YYYY'

// Exported so a column rendering an absent document reads the same as an absent date below.
export const EMPTY_CELL = '—'

// For the timestamps the server stamps itself: publishedAt, ackedAt.
export const formatInstant = (value: Date | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)

// signedAt is the one date a person types, and it stays a bare YYYY-MM-DD string end to end so it
// never meets a timezone; parsing it here is local-only and cannot shift the day.
export const formatDayString = (value: string | null) => (value ? dayjs(value).format(DISPLAY_FORMAT) : EMPTY_CELL)
