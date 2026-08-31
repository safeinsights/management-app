import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen } from './resolve'
import { studyState } from './state.fixture'

const st = (overrides: Partial<StudyState>): StudyState =>
    studyState({ status: 'PENDING-REVIEW', isDraft: false, displayStatus: 'PENDING-REVIEW', ...overrides })

const screen = (s: StudyState) => resolveScreen('reviewer', s).screen

describe('resolveScreen(reviewer)', () => {
    it('PENDING-REVIEW → reviewer-proposal-review', () => {
        expect(screen(st({ status: 'PENDING-REVIEW' }))).toBe('reviewer-proposal-review')
    })

    it('decided proposal, no code → reviewer-proposal-feedback', () => {
        expect(screen(st({ status: 'APPROVED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'REJECTED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'CHANGE-REQUESTED' }))).toBe('reviewer-proposal-feedback')
    })

    it('code submitted, agreements NOT acked → reviewer-agreements (gate before review)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    reviewerAgreementsAcked: false,
                }),
            ),
        ).toBe('reviewer-agreements')
    })

    it('code submitted, agreements acked → reviewer-code-review', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    reviewerAgreementsAcked: true,
                }),
            ),
        ).toBe('reviewer-code-review')
    })

    it('live code decision → reviewer-code-feedback (not active review)', () => {
        for (const d of ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED'] as const) {
            expect(screen(st({ status: 'APPROVED', hasSubmittedCode: true, codeDecision: d }))).toBe(
                'reviewer-code-feedback',
            )
        }
    })

    it('code approved and executing in the enclave, no results → reviewer-outputs-pending', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    isExecuting: true,
                }),
            ),
        ).toBe('reviewer-outputs-pending')
    })

    it('job errored, no files decision → reviewer-outputs-errored (not study-results)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsErrored: true,
                }),
            ),
        ).toBe('reviewer-outputs-errored')
    })

    it('run complete, no files decision → reviewer-outputs-available (not study-results)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsDisplayStatus: 'RUN-COMPLETE',
                }),
            ),
        ).toBe('reviewer-outputs-available')
    })

    it('run complete AND errored → reviewer-outputs-errored (errored out-ranks available)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsErrored: true,
                    resultsDisplayStatus: 'JOB-ERRORED',
                }),
            ),
        ).toBe('reviewer-outputs-errored')
    })

    it('run complete then files approved → reviewer-outputs-decided (OTTER-677)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsApproved: true,
                    resultsDisplayStatus: 'FILES-APPROVED',
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('run complete then files rejected → reviewer-outputs-decided (OTTER-677)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsRejected: true,
                    resultsDisplayStatus: 'FILES-REJECTED',
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('job errored then files-rejected → reviewer-outputs-decided (errored no longer intercepted)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsErrored: true,
                    resultsRejected: true,
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('job errored then files-approved → reviewer-outputs-decided', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsErrored: true,
                    resultsApproved: true,
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('decided results out-rank the executing window → reviewer-outputs-decided (not outputs-pending)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    isExecuting: true,
                    hasResults: true,
                    resultsApproved: true,
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('decided results out-rank a present code decision → reviewer-outputs-decided', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    hasResults: true,
                    resultsApproved: true,
                }),
            ),
        ).toBe('reviewer-outputs-decided')
    })

    it('resubmission (fresh submit, no live decision) → back to reviewer-code-review, not stale feedback', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeAwaitingDecision: true,
                    codeDecision: null,
                    reviewerAgreementsAcked: true,
                }),
            ),
        ).toBe('reviewer-code-review')
    })

    it('agreements gate only applies while awaiting decision (irrelevant once decided)', () => {
        expect(
            screen(
                st({
                    status: 'APPROVED',
                    hasSubmittedCode: true,
                    codeDecision: 'CODE-APPROVED',
                    reviewerAgreementsAcked: false,
                }),
            ),
        ).toBe('reviewer-code-feedback')
    })
})
