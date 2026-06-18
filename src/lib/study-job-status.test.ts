import { describe, it, expect } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import { latestSubmittedJobHasLiveCodeDecision, latestSubmittedJobLiveCodeDecisionStatus } from './study-job-status'

const changes = (...statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

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

describe('latestSubmittedJobLiveCodeDecisionStatus', () => {
    it('returns null before any decision', () => {
        expect(latestSubmittedJobLiveCodeDecisionStatus(changes('CODE-SUBMITTED'))).toBeNull()
        expect(latestSubmittedJobLiveCodeDecisionStatus(changes('CODE-SUBMITTED', 'CODE-SCANNED'))).toBeNull()
        expect(latestSubmittedJobLiveCodeDecisionStatus([])).toBeNull()
    })

    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'returns %s when the decision follows a submission',
        (decision) => {
            expect(latestSubmittedJobLiveCodeDecisionStatus(changes('CODE-SUBMITTED', decision))).toBe(decision)
        },
    )

    // OTTER-556 dead-end: the scan result is an async webhook (job-scan-results/route.ts) that can
    // land *after* the decision, appending CODE-SCANNED as the job's latest status. CODE-SCANNED is
    // scan metadata, not a new submission, so the decision must still be reported.
    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'returns %s when a late CODE-SCANNED lands after the decision',
        (decision) => {
            expect(latestSubmittedJobLiveCodeDecisionStatus(changes('CODE-SUBMITTED', decision, 'CODE-SCANNED'))).toBe(
                decision,
            )
        },
    )

    // Order-independent: a decision written in the same transaction as a sibling status ties on
    // createdAt, so it can appear anywhere in the array. The reported decision must not depend on
    // position (mirrors the latestSubmittedJobHasLiveCodeDecision tie tests).
    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'returns %s regardless of array order',
        (decision) => {
            expect(latestSubmittedJobLiveCodeDecisionStatus(changes('CODE-SCANNED', decision, 'CODE-SUBMITTED'))).toBe(
                decision,
            )
        },
    )

    it('returns null once a resubmission adds an un-decided CODE-SUBMITTED', () => {
        // Round 1 decided (changes requested), round 2 resubmitted and awaiting review: no live decision.
        expect(
            latestSubmittedJobLiveCodeDecisionStatus(
                changes('CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'),
            ),
        ).toBeNull()
    })

    it('returns a decision once a resubmission is itself decided', () => {
        // The only case that genuinely exercises .find()'s position-dependence: two *different*
        // decisions in one history. The "regardless of array order" test above has a single
        // decision, so it cannot prove this path. Route data is ordered newest-first by
        // jobStatusChange.createdAt/id, so the first decision in that list is the live round's.
        // In page.tsx this exact combo never reaches here: the hasJobStatus(['CODE-APPROVED', ...])
        // short-circuit picks CODE-APPROVED before this function is consulted.
        expect(
            latestSubmittedJobLiveCodeDecisionStatus(
                changes('CODE-APPROVED', 'CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'),
            ),
        ).toBe('CODE-APPROVED')
    })
})
