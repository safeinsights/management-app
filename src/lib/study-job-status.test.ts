import { describe, it, expect } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import { isCodeReviewableLatest, latestSubmittedJobHasLiveCodeDecision } from './study-job-status'

const changes = (...statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

// isCodeReviewableLatest is recency-aware and expects newest-first input (the order the
// queries return: createdAt desc, id desc). newestFirst() names that explicitly.
const newestFirst = (...statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

describe('isCodeReviewableLatest', () => {
    it('is false with no code submission', () => {
        expect(isCodeReviewableLatest([])).toBe(false)
        expect(isCodeReviewableLatest(newestFirst('INITIATED'))).toBe(false)
    })

    it('is true for a fresh first submission (no decision yet)', () => {
        expect(isCodeReviewableLatest(newestFirst('CODE-SUBMITTED'))).toBe(true)
        expect(isCodeReviewableLatest(newestFirst('CODE-SCANNED', 'CODE-SUBMITTED'))).toBe(true)
    })

    it('is true when a resubmission is newer than the prior change request', () => {
        expect(
            isCodeReviewableLatest(
                newestFirst('CODE-SCANNED', 'CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'),
            ),
        ).toBe(true)
    })

    it('is false when the newest code change is a decision (awaiting the researcher)', () => {
        expect(isCodeReviewableLatest(newestFirst('CODE-CHANGES-REQUESTED', 'CODE-SCANNED', 'CODE-SUBMITTED'))).toBe(
            false,
        )
        expect(isCodeReviewableLatest(newestFirst('CODE-REJECTED', 'CODE-SUBMITTED'))).toBe(false)
    })

    it('is false once approved and running (CODE-APPROVED newer than the submission)', () => {
        expect(
            isCodeReviewableLatest(newestFirst('JOB-RUNNING', 'CODE-APPROVED', 'CODE-SCANNED', 'CODE-SUBMITTED')),
        ).toBe(false)
    })
})

describe('latestSubmittedJobHasLiveCodeDecision', () => {
    it('is false when no decision exists yet', () => {
        expect(latestSubmittedJobHasLiveCodeDecision(changes('CODE-SUBMITTED'))).toBe(false)
        expect(latestSubmittedJobHasLiveCodeDecision(changes('CODE-SUBMITTED', 'CODE-SCANNED'))).toBe(false)
        expect(latestSubmittedJobHasLiveCodeDecision([])).toBe(false)
    })

    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'is true when a %s decision follows a submission',
        (decision) => {
            expect(latestSubmittedJobHasLiveCodeDecision(changes('CODE-SUBMITTED', decision))).toBe(true)
        },
    )

    // The bug: jobStatusChange rows written in the same transaction tie on createdAt and v7 ids
    // are not reliably monotonic within a millisecond, so "latest status" ordering can put
    // CODE-SUBMITTED ahead of the decision. The count is order-independent, so the array order
    // here (decision *before* the submission it decides) must not change the result.
    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'is true for a %s decision regardless of array order (same-millisecond tie)',
        (decision) => {
            expect(latestSubmittedJobHasLiveCodeDecision(changes(decision, 'CODE-SUBMITTED'))).toBe(true)
        },
    )

    it('is false again once a resubmission adds an un-decided CODE-SUBMITTED', () => {
        // Round 1 decided (changes requested), round 2 resubmitted and awaiting review.
        expect(
            latestSubmittedJobHasLiveCodeDecision(
                changes('CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'),
            ),
        ).toBe(false)
    })

    it('is true again once the resubmission is itself decided', () => {
        expect(
            latestSubmittedJobHasLiveCodeDecision(
                changes('CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'),
            ),
        ).toBe(true)
    })

    it('treats CODE-SCANNED as part of a submission, not a new one', () => {
        expect(latestSubmittedJobHasLiveCodeDecision(changes('CODE-SUBMITTED', 'CODE-SCANNED', 'CODE-APPROVED'))).toBe(
            true,
        )
    })
})
