import dayjs from 'dayjs'

const DISPLAY_FORMAT = 'MMM DD, YYYY'

// publishedAt is an instant, so it gets the app's date format.
export const formatPublishedOn = (publishedAt: Date | null) =>
    publishedAt ? dayjs(publishedAt).format(DISPLAY_FORMAT) : '—'

// signedAt stays a bare YYYY-MM-DD string end to end so it never meets a timezone; parsing it here
// is local-only and cannot shift the day.
export const formatSignedOn = (signedAt: string | null) => (signedAt ? dayjs(signedAt).format(DISPLAY_FORMAT) : '—')
