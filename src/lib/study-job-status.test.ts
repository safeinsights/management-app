import { describe, it, expect } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import {
    currentExecutionStage,
    latestCodeChangeIsSubmission,
    latestSubmittedJobHasLiveCodeDecision,
} from './study-job-status'

const changes = (...statuses: StudyJobStatus[]) => statuses.map((status) => ({ status }))

describe('latestCodeChangeIsSubmission', () => {
    it('is false with no code submission', () => {
        expect(latestCodeChangeIsSubmission([])).toBe(false)
        expect(latestCodeChangeIsSubmission(changes('INITIATED'))).toBe(false)
    })

    it('is true for a fresh first submission (no decision yet)', () => {
        expect(latestCodeChangeIsSubmission(changes('CODE-SUBMITTED'))).toBe(true)
        expect(latestCodeChangeIsSubmission(changes('CODE-SCANNED', 'CODE-SUBMITTED'))).toBe(true)
    })

    it('is true when a resubmission follows the prior change request', () => {
        expect(
            latestCodeChangeIsSubmission(
                changes('CODE-SCANNED', 'CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'),
            ),
        ).toBe(true)
    })

    it('is false when the newest code change is a decision (awaiting the researcher)', () => {
        expect(latestCodeChangeIsSubmission(changes('CODE-CHANGES-REQUESTED', 'CODE-SCANNED', 'CODE-SUBMITTED'))).toBe(
            false,
        )
        expect(latestCodeChangeIsSubmission(changes('CODE-REJECTED', 'CODE-SUBMITTED'))).toBe(false)
    })

    it('is false once approved and running', () => {
        expect(
            latestCodeChangeIsSubmission(changes('JOB-RUNNING', 'CODE-APPROVED', 'CODE-SCANNED', 'CODE-SUBMITTED')),
        ).toBe(false)
    })

    // Counting is order-independent, so a decision and the submission it decides tying on
    // createdAt (the legacy single-job same-millisecond case) must not flip the result.
    it('is order-independent for a decided submission (same-millisecond tie)', () => {
        expect(latestCodeChangeIsSubmission(changes('CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'))).toBe(false)
        expect(latestCodeChangeIsSubmission(changes('CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'))).toBe(false)
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

describe('currentExecutionStage', () => {
    it('returns null when no execution stage has been recorded', () => {
        expect(currentExecutionStage([])).toBeNull()
        expect(currentExecutionStage([{ status: 'CODE-APPROVED', createdAt: new Date() }])).toBeNull()
    })

    it('returns the single execution stage and the time it started', () => {
        const startedAt = new Date('2026-07-20T10:00:00Z')
        expect(
            currentExecutionStage([
                { status: 'CODE-APPROVED', createdAt: new Date('2026-07-20T09:00:00Z') },
                { status: 'JOB-PACKAGING', createdAt: startedAt },
            ]),
        ).toEqual({ status: 'JOB-PACKAGING', startedAt })
    })

    it('returns the most recently started stage when several are present', () => {
        const running = new Date('2026-07-20T12:00:00Z')
        expect(
            currentExecutionStage([
                { status: 'JOB-PROVISIONING', createdAt: new Date('2026-07-20T10:00:00Z') },
                { status: 'JOB-PACKAGING', createdAt: new Date('2026-07-20T10:30:00Z') },
                { status: 'JOB-READY', createdAt: new Date('2026-07-20T11:00:00Z') },
                { status: 'JOB-RUNNING', createdAt: running },
            ]),
        ).toEqual({ status: 'JOB-RUNNING', startedAt: running })
    })

    it('accepts ISO string timestamps', () => {
        expect(
            currentExecutionStage([
                { status: 'JOB-PACKAGING', createdAt: '2026-07-20T10:00:00Z' },
                { status: 'JOB-RUNNING', createdAt: '2026-07-20T11:00:00Z' },
            ]),
        ).toEqual({ status: 'JOB-RUNNING', startedAt: '2026-07-20T11:00:00Z' })
    })
})
