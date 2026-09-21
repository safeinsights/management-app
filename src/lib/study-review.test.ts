import { describe, it, expect } from 'vitest'
import { isStudyReviewStale, STUDY_REVIEW_STALE_AFTER_MS, studyReviewState, type StudyReviewRow } from './study-review'

const now = Date.now()
const row = (overrides: Partial<StudyReviewRow> = {}): StudyReviewRow => ({
    report: null,
    summaryFailedAt: null,
    summaryStartedAt: new Date(now),
    ...overrides,
})

describe('studyReviewState', () => {
    it('reads a row with a failure timestamp as failed, even when a report is present', () => {
        expect(studyReviewState(row({ summaryFailedAt: new Date(now) }))).toBe('failed')
        expect(studyReviewState(row({ report: { codeExplanation: 'x' }, summaryFailedAt: new Date(now) }))).toBe(
            'failed',
        )
    })

    it('reads a row with no report and no failure as pending', () => {
        expect(studyReviewState(row())).toBe('pending')
    })

    it('reads a row with a report as ready', () => {
        expect(studyReviewState(row({ report: { codeExplanation: 'x' } }))).toBe('ready')
    })
})

describe('isStudyReviewStale', () => {
    it('is false for a pending run inside the threshold', () => {
        expect(isStudyReviewStale(row({ summaryStartedAt: new Date(now - 60_000) }), now)).toBe(false)
    })

    it('is true once a pending run passes the threshold', () => {
        expect(isStudyReviewStale(row({ summaryStartedAt: new Date(now - STUDY_REVIEW_STALE_AFTER_MS) }), now)).toBe(
            true,
        )
    })

    it('treats a pending row with no start time as stale', () => {
        expect(isStudyReviewStale(row({ summaryStartedAt: null }), now)).toBe(true)
    })

    it('accepts a serialized timestamp, which is what crosses the server boundary', () => {
        const startedAt = new Date(now - STUDY_REVIEW_STALE_AFTER_MS).toISOString()
        expect(isStudyReviewStale(row({ summaryStartedAt: startedAt }), now)).toBe(true)
    })

    it('is false for a ready or failed row however old it is', () => {
        const old = new Date(now - 10 * STUDY_REVIEW_STALE_AFTER_MS)
        expect(isStudyReviewStale(row({ report: { codeExplanation: 'x' }, summaryStartedAt: old }), now)).toBe(false)
        expect(isStudyReviewStale(row({ summaryFailedAt: old, summaryStartedAt: old }), now)).toBe(false)
    })
})
