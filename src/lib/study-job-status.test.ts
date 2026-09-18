import { describe, it, expect } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import {
    currentExecutionStage,
    latestCodeChangeIsSubmission,
    latestStatusAt,
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

    // Rows written in one transaction tie on createdAt and v7 ids are not monotonic within a
    // millisecond, so "latest status" ordering can put CODE-SUBMITTED ahead of the decision.
    it.each(['CODE-APPROVED', 'CODE-CHANGES-REQUESTED', 'CODE-REJECTED'] as const)(
        'is true for a %s decision regardless of array order (same-millisecond tie)',
        (decision) => {
            expect(latestSubmittedJobHasLiveCodeDecision(changes(decision, 'CODE-SUBMITTED'))).toBe(true)
        },
    )

    it('is false again once a resubmission adds an un-decided CODE-SUBMITTED', () => {
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

    it('picks the furthest pipeline stage when timestamps tie (out-of-order writes)', () => {
        const sameMs = new Date('2026-07-20T10:00:00Z')
        expect(
            currentExecutionStage([
                { status: 'JOB-PROVISIONING', createdAt: sameMs },
                { status: 'JOB-RUNNING', createdAt: sameMs },
                { status: 'JOB-READY', createdAt: sameMs },
            ]),
        ).toEqual({ status: 'JOB-RUNNING', startedAt: sameMs })
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

describe('latestStatusAt', () => {
    it('returns null when the status never occurred', () => {
        expect(latestStatusAt([], 'RUN-COMPLETE')).toBeNull()
        expect(latestStatusAt([{ status: 'JOB-RUNNING', createdAt: new Date() }], 'RUN-COMPLETE')).toBeNull()
    })

    it('returns the timestamp of the requested status', () => {
        const completedAt = new Date('2026-07-20T12:00:00Z')
        expect(
            latestStatusAt(
                [
                    { status: 'JOB-RUNNING', createdAt: new Date('2026-07-20T10:00:00Z') },
                    { status: 'RUN-COMPLETE', createdAt: completedAt },
                ],
                'RUN-COMPLETE',
            ),
        ).toBe(completedAt)
    })

    it('picks the most recent occurrence regardless of array order', () => {
        const rerunAt = new Date('2026-07-21T09:00:00Z')
        const firstRunAt = new Date('2026-07-20T12:00:00Z')
        expect(
            latestStatusAt(
                [
                    { status: 'RUN-COMPLETE', createdAt: rerunAt },
                    { status: 'RUN-COMPLETE', createdAt: firstRunAt },
                ],
                'RUN-COMPLETE',
            ),
        ).toBe(rerunAt)
        expect(
            latestStatusAt(
                [
                    { status: 'RUN-COMPLETE', createdAt: firstRunAt },
                    { status: 'RUN-COMPLETE', createdAt: rerunAt },
                ],
                'RUN-COMPLETE',
            ),
        ).toBe(rerunAt)
    })

    it('accepts ISO string timestamps', () => {
        expect(
            latestStatusAt(
                [
                    { status: 'RUN-COMPLETE', createdAt: '2026-07-20T12:00:00Z' },
                    { status: 'RUN-COMPLETE', createdAt: '2026-07-21T09:00:00Z' },
                ],
                'RUN-COMPLETE',
            ),
        ).toBe('2026-07-21T09:00:00Z')
    })
})
