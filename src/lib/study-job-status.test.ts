import { describe, it, expect } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import { latestSubmittedJobHasLiveCodeDecision } from './study-job-status'

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
