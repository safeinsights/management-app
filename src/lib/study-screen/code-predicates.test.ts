import { describe, expect, it } from 'vitest'
import type { StudyJobStatus } from '@/database/types'
import {
    canResubmitCode,
    canReviewerReviewCode,
    canStartCodeRevisionDraft,
    canStartInitialCodeDraft,
    canSubmitInitialCode,
    hasOpenCodeDraftRound,
    type CodeRoundStatuses,
} from './code-predicates'

const s = (latestAbsolute: StudyJobStatus[] | null, latestSubmitted: StudyJobStatus[] | null): CodeRoundStatuses => ({
    latestAbsolute,
    latestSubmitted,
})

describe('code predicates', () => {
    it('detects an open draft round only when the absolute-latest round is INITIATED-only', () => {
        expect(hasOpenCodeDraftRound(s(['INITIATED'], null))).toBe(true)
        expect(hasOpenCodeDraftRound(s(['INITIATED'], ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']))).toBe(true)
        expect(hasOpenCodeDraftRound(s(['INITIATED', 'CODE-SUBMITTED'], ['INITIATED', 'CODE-SUBMITTED']))).toBe(false)
        expect(hasOpenCodeDraftRound(s(null, null))).toBe(false)
    })

    it('initial submit is allowed only with an open draft and no prior submitted round', () => {
        expect(canSubmitInitialCode(s(['INITIATED'], null))).toBe(true)
        // A prior submitted round exists → not the initial path (must resubmit with a note).
        expect(canSubmitInitialCode(s(['INITIATED'], ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']))).toBe(false)
        // Re-submitting the same un-reviewed round is still the initial path.
        expect(canStartInitialCodeDraft(s(['INITIATED', 'CODE-SUBMITTED'], null))).toBe(true)
    })

    it('resubmit + revision-draft entry states: changes-requested, bare errored, files decisions', () => {
        for (const submitted of [
            ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'],
            ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'],
            ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED'],
            ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED'],
        ] as StudyJobStatus[][]) {
            expect(canResubmitCode(s(['INITIATED'], submitted))).toBe(true)
            expect(canStartCodeRevisionDraft(s(submitted, submitted))).toBe(true)
        }
    })

    it('non-entry states: terminal rejected, and normal approved/running', () => {
        expect(canResubmitCode(s(null, ['CODE-SUBMITTED', 'CODE-REJECTED']))).toBe(false)
        expect(canResubmitCode(s(null, ['CODE-SUBMITTED', 'CODE-APPROVED']))).toBe(false)
        expect(canResubmitCode(s(null, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING']))).toBe(false)
        // Already awaiting review again after a resubmit → not resubmittable.
        expect(canResubmitCode(s(null, ['INITIATED', 'CODE-SUBMITTED']))).toBe(false)
    })

    it('reviewer can review only an awaiting submitted round with no open draft masking it', () => {
        expect(canReviewerReviewCode(s(['INITIATED', 'CODE-SUBMITTED'], ['INITIATED', 'CODE-SUBMITTED']))).toBe(true)
        // Open draft round over a decided round → reviewer not actionable.
        expect(canReviewerReviewCode(s(['INITIATED'], ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']))).toBe(false)
        // Already decided → not awaiting.
        expect(canReviewerReviewCode(s(null, ['CODE-SUBMITTED', 'CODE-APPROVED']))).toBe(false)
    })
})
