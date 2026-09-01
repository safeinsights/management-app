import { describe, expect, it } from 'vitest'
import { hasNextStepFromCode } from './next-step'
import { studyState } from './state.fixture'
import type { StudyState } from './state.types'

const state = (overrides: Partial<StudyState> = {}): StudyState =>
    studyState({
        status: 'APPROVED',
        isDraft: false,
        hasStep2Progress: true,
        researcherAgreementsAcked: true,
        reviewerAgreementsAcked: true,
        hasAnyJob: true,
        hasSubmittedCode: true,
        codeDecision: 'CODE-APPROVED',
        submissionRound: 1,
        displayStatus: 'CODE-APPROVED',
        latestJobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED'],
        ...overrides,
    })

describe('hasNextStepFromCode', () => {
    describe('researcher', () => {
        it('is false while /view still resolves to the code screen', () => {
            expect(hasNextStepFromCode('researcher', state(), 'code-approved')).toBe(false)
        })

        it('is true once results have landed and /view resolves to the results screen', () => {
            expect(hasNextStepFromCode('researcher', state({ hasResults: true }), 'code-approved')).toBe(true)
        })

        it('is true while the enclave runs the job and /view resolves to outputs-pending (OTTER-686)', () => {
            const executing = state({ isExecuting: true })
            expect(hasNextStepFromCode('researcher', executing, 'code-approved')).toBe(true)
        })

        // A packaging failure records no execution substatus, so isExecuting stays false and the
        // researcher is held on the code screen while the reviewer triages.
        it('is false for a job that errored before execution started', () => {
            const errored = state({ hasResults: true, resultsErrored: true, isExecuting: false })
            expect(hasNextStepFromCode('researcher', errored, 'code-approved')).toBe(false)
        })

        // outputs-pending reports the last execution stage and discloses nothing about a failure
        // the reviewer has yet to triage (OTTER-598).
        it('forwards to a screen that hides an error still awaiting a files decision', () => {
            const errored = state({ hasResults: true, resultsErrored: true, isExecuting: true })
            expect(hasNextStepFromCode('researcher', errored, 'code-approved')).toBe(true)
        })

        it('is false for a decided-against study, which ends on the code screen', () => {
            const rejected = state({ codeDecision: 'CODE-REJECTED' })
            expect(hasNextStepFromCode('researcher', rejected, 'code-feedback')).toBe(false)
        })
    })

    describe('reviewer', () => {
        it('is false while /review still resolves to the code screen', () => {
            expect(hasNextStepFromCode('reviewer', state(), 'reviewer-code-feedback')).toBe(false)
        })

        it('is true once the enclave is running the job and /review resolves to outputs', () => {
            const executing = state({ isExecuting: true })
            expect(hasNextStepFromCode('reviewer', executing, 'reviewer-code-feedback')).toBe(true)
        })

        it('is true when walking back to the code step from a results study', () => {
            const withResults = state({ hasResults: true })
            expect(hasNextStepFromCode('reviewer', withResults, 'reviewer-code-feedback')).toBe(true)
        })

        it('is false for a decided-against study, which ends on the code screen', () => {
            const rejected = state({ codeDecision: 'CODE-REJECTED' })
            expect(hasNextStepFromCode('reviewer', rejected, 'reviewer-code-feedback')).toBe(false)
        })
    })
})
