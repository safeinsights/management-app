import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen, resolveResearcherCodeScreen, resolveReviewerCodeScreen } from './resolve'
import { studyState } from './state.fixture'

const state = (overrides: Partial<StudyState>): StudyState => studyState(overrides)

describe('resolveScreen (researcher)', () => {
    it('results present → study-results (highest precedence)', () => {
        expect(resolveScreen('researcher', state({ hasResults: true, codeDecision: 'CODE-APPROVED' })).screen).toBe(
            'study-results',
        )
    })
    it('errored job, no reviewer files decision → outputs-pending, NOT study-results (OTTER-598, 43898)', () => {
        // hasResults is true (JOB-ERRORED ∈ STUDY_RESULTS_JOB_STATUSES) but the error is still hidden
        // from the researcher, so routing must NOT jump to the results screen.
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsErrored: true, codeDecision: 'CODE-APPROVED', isExecuting: true }),
            ).screen,
        ).toBe('outputs-pending')
    })
    it('errored job after a reviewer files decision → study-results (error no longer hidden)', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsErrored: true, resultsRejected: true, codeDecision: 'CODE-APPROVED' }),
            ).screen,
        ).toBe('study-results')
    })
    it('OTTER-695: feedback-only decision on a clean run → outputs-feedback (out-ranks study-results)', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsRejected: true, codeDecision: 'CODE-APPROVED' }),
            ).screen,
        ).toBe('outputs-feedback')
    })
    it('OTTER-695: share-outputs decision (resultsApproved) still → study-results', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsApproved: true, codeDecision: 'CODE-APPROVED' }),
            ).screen,
        ).toBe('study-results')
    })
    it('OTTER-695: clean run with no files decision yet (RUN-COMPLETE) still → study-results, not outputs-feedback', () => {
        expect(
            resolveScreen(
                'researcher',
                state({
                    hasResults: true,
                    resultsDisplayStatus: 'RUN-COMPLETE',
                    codeDecision: 'CODE-APPROVED',
                }),
            ).screen,
        ).toBe('study-results')
    })
    it('errored job with a stale code decision (resubmission) → code-under-review, NOT study-results (OTTER-598)', () => {
        // Edge case raised in PR #837: resultsErrored excludes from study-results, the prior
        // CODE-APPROVED was dropped by dropStale (so codeDecision is null and codeAwaitingDecision
        // is true), and isExecuting is false. It must NOT fall through to study-results; it lands on
        // code-under-review, which is the right next-step screen for a re-reviewed resubmission.
        expect(
            resolveScreen(
                'researcher',
                state({
                    hasResults: true,
                    resultsErrored: true,
                    codeDecision: null,
                    codeAwaitingDecision: true,
                    hasSubmittedCode: true,
                    isExecuting: false,
                }),
            ).screen,
        ).toBe('code-under-review')
    })
    it('approved decision → code-approved', () => {
        expect(resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED' })).screen).toBe('code-approved')
    })
    it('executing window → outputs-pending', () => {
        expect(resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED', isExecuting: true })).screen).toBe(
            'outputs-pending',
        )
    })
    it('changes requested → code-feedback', () => {
        const d = resolveScreen('researcher', state({ codeDecision: 'CODE-CHANGES-REQUESTED' }))
        expect(d.screen).toBe('code-feedback')
    })
    it('awaiting decision → code-under-review', () => {
        expect(resolveScreen('researcher', state({ codeAwaitingDecision: true, hasSubmittedCode: true })).screen).toBe(
            'code-under-review',
        )
    })
    it('approved proposal, no code → read-only proposal-feedback', () => {
        expect(
            resolveScreen('researcher', state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: false }))
                .screen,
        ).toBe('proposal-feedback')
    })
    it('approved proposal, no code, agreements acked → still proposal-feedback (no code-upload phantom screen)', () => {
        expect(
            resolveScreen('researcher', state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: true }))
                .screen,
        ).toBe('proposal-feedback')
    })
    it('pending review (no job) → study-overview (generic layout)', () => {
        expect(resolveScreen('researcher', state({ status: 'PENDING-REVIEW', isDraft: false })).screen).toBe(
            'study-overview',
        )
    })
    it('draft → study-overview (generic layout; editing lives on /edit)', () => {
        expect(resolveScreen('researcher', state({ status: 'DRAFT', isDraft: true })).screen).toBe('study-overview')
    })
    it('CHANGE-REQUESTED → proposal-feedback', () => {
        expect(resolveScreen('researcher', state({ status: 'CHANGE-REQUESTED', isDraft: false })).screen).toBe(
            'proposal-feedback',
        )
    })
})

// OTTER-614: resolveResearcherCodeScreen backs the read-only /view/code route — it returns the
// matching code screen, or undefined when the study hasn't reached the code stage (route 404s, no
// forward jumps).
describe('resolveResearcherCodeScreen (read-only /view/code)', () => {
    it('results study → approved-code screen (results imply approved code)', () => {
        const resultsStudy = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            hasResults: true,
            resultsApproved: true,
        })
        expect(resolveResearcherCodeScreen(resultsStudy)).toEqual({ screen: 'code-approved' })
    })

    it('OTTER-695: feedback-only results study → approved-code screen (Previous step target)', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            hasResults: true,
            resultsRejected: true,
        })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-approved' })
    })

    it('picks the code screen by state: changes-requested → code-feedback', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-CHANGES-REQUESTED',
        })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-feedback' })
    })

    it('awaiting decision → code-under-review', () => {
        const s = state({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeAwaitingDecision: true })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-under-review' })
    })

    it('resolves an executing study to the approved-code screen', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            isExecuting: true,
        })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-approved' })
    })

    it('cannot jump ahead: approved proposal with no code → undefined (route 404s)', () => {
        const s = state({ status: 'APPROVED', isDraft: false })
        expect(resolveResearcherCodeScreen(s)).toBeUndefined()
    })
    it('cannot jump ahead: pending-review study → undefined (route 404s)', () => {
        const s = state({ status: 'PENDING-REVIEW', isDraft: false })
        expect(resolveResearcherCodeScreen(s)).toBeUndefined()
    })
})

describe('resolveScreen (reviewer)', () => {
    it('decided results → reviewer-outputs-decided (OTTER-677, highest precedence)', () => {
        expect(
            resolveScreen('reviewer', state({ hasResults: true, resultsApproved: true, codeDecision: 'CODE-APPROVED' }))
                .screen,
        ).toBe('reviewer-outputs-decided')
    })
    it('undecided results → reviewer-outputs-available (decrypt-before-review, OTTER-668)', () => {
        expect(
            resolveScreen(
                'reviewer',
                state({ hasResults: true, resultsDisplayStatus: 'RUN-COMPLETE', codeDecision: 'CODE-APPROVED' }),
            ).screen,
        ).toBe('reviewer-outputs-available')
    })
    it('pending review → reviewer-proposal-review', () => {
        expect(resolveScreen('reviewer', state({ status: 'PENDING-REVIEW', isDraft: false })).screen).toBe(
            'reviewer-proposal-review',
        )
    })
})

// OTTER-643: resolveReviewerCodeScreen backs the read-only /review/code route — the DO counterpart to
// resolveResearcherCodeScreen. It returns the matching code screen (skipping reviewer-outputs-decided so
// a decided study doesn't loop), or undefined when the study hasn't reached the code stage (route 404s).
describe('resolveReviewerCodeScreen (read-only /review/code)', () => {
    it('results study → reviewer-code-feedback (results imply an approved code decision)', () => {
        const resultsStudy = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            hasResults: true,
            resultsApproved: true,
        })
        expect(resolveReviewerCodeScreen(resultsStudy)).toEqual({
            screen: 'reviewer-code-feedback',
            readOnlyCodeStep: true,
        })
    })

    it('changes-requested decision → reviewer-code-feedback', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-CHANGES-REQUESTED',
        })
        expect(resolveReviewerCodeScreen(s)).toEqual({ screen: 'reviewer-code-feedback', readOnlyCodeStep: true })
    })

    it('awaiting decision, agreements acked → reviewer-code-review', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeAwaitingDecision: true,
            reviewerAgreementsAcked: true,
        })
        expect(resolveReviewerCodeScreen(s)).toEqual({ screen: 'reviewer-code-review', readOnlyCodeStep: true })
    })

    it('awaiting decision, agreements NOT acked → reviewer-agreements', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeAwaitingDecision: true,
            reviewerAgreementsAcked: false,
        })
        expect(resolveReviewerCodeScreen(s)).toEqual({ screen: 'reviewer-agreements', readOnlyCodeStep: true })
    })

    it('cannot jump ahead: approved proposal with no code → undefined (route 404s)', () => {
        const s = state({ status: 'APPROVED', isDraft: false })
        expect(resolveReviewerCodeScreen(s)).toBeUndefined()
    })
    it('cannot jump ahead: pending-review study → undefined (route 404s)', () => {
        const s = state({ status: 'PENDING-REVIEW', isDraft: false })
        expect(resolveReviewerCodeScreen(s)).toBeUndefined()
    })
})
