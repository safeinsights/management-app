// A generation run claims its round by writing a pending row, so "no row yet" stops meaning both
// "still working" and "died without saying so". The server aborts its own run at the deadline and
// records the failure; anything older than the stale threshold is a run that never got that far,
// and the reviewer is offered a retry (OTTER-799).
export const STUDY_REVIEW_GENERATION_DEADLINE_MS = 8 * 60_000
export const STUDY_REVIEW_STALE_AFTER_MS = 10 * 60_000

// A queued round has not been picked up yet, so it gets a longer clock than a running one: the
// worker's concurrency is capped, and a burst of large submissions can legitimately leave one
// waiting. Past this the reviewer has stopped waiting, so the worker drops the message rather than
// paying for a report nobody is still watching for.
export const STUDY_REVIEW_QUEUE_STALE_AFTER_MS = 30 * 60_000

export type StudyReviewRow = {
    report: unknown
    createdAt: Date | string
    summaryFailedAt: Date | string | null
    summaryStartedAt: Date | string | null
}

export type StudyReviewState = 'failed' | 'pending' | 'ready'

export function studyReviewState(row: StudyReviewRow): StudyReviewState {
    if (row.summaryFailedAt != null) return 'failed'
    return row.report == null ? 'pending' : 'ready'
}

const msSince = (moment: Date | string, now: number) => now - new Date(moment).getTime()

// A pending row with no start time is queued and waiting for a worker, so it is judged from when it
// was written. Rows that predate the claim column land here too, and their age makes them stale.
export function isStudyReviewStale(row: StudyReviewRow, now: number = Date.now()): boolean {
    if (studyReviewState(row) !== 'pending') return false
    if (row.summaryStartedAt == null) return msSince(row.createdAt, now) >= STUDY_REVIEW_QUEUE_STALE_AFTER_MS
    return msSince(row.summaryStartedAt, now) >= STUDY_REVIEW_STALE_AFTER_MS
}
