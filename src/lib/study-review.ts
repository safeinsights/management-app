// A generation run claims its round by writing a pending row, so "no row yet" stops meaning both
// "still working" and "died without saying so". The server aborts its own run at the deadline and
// records the failure; anything older than the stale threshold is a run that never got that far,
// and the reviewer is offered a retry (OTTER-799).
export const STUDY_REVIEW_GENERATION_DEADLINE_MS = 8 * 60_000
export const STUDY_REVIEW_STALE_AFTER_MS = 10 * 60_000

export type StudyReviewRow = {
    report: unknown
    summaryFailedAt: Date | string | null
    summaryStartedAt: Date | string | null
}

export type StudyReviewState = 'failed' | 'pending' | 'ready'

export function studyReviewState(row: StudyReviewRow): StudyReviewState {
    if (row.summaryFailedAt != null) return 'failed'
    return row.report == null ? 'pending' : 'ready'
}

// A row with no start time predates the claim, so it cannot be vouched for and reads as stale.
export function isStudyReviewStale(row: StudyReviewRow, now: number = Date.now()): boolean {
    if (studyReviewState(row) !== 'pending') return false
    if (row.summaryStartedAt == null) return true
    return now - new Date(row.summaryStartedAt).getTime() >= STUDY_REVIEW_STALE_AFTER_MS
}
