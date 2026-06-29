import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen, resolveResearcherCodeScreen } from './resolve'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
    hasStep2Progress: false,
    researcherAgreementsAcked: false,
    reviewerAgreementsAcked: false,
    hasAnyJob: false,
    hasSubmittedCode: false,
    codeDecision: null,
    codeAwaitingDecision: false,
    isExecuting: false,
    hasResults: false,
    resultsApproved: false,
    resultsRejected: false,
    resultsErrored: false,
    resultsDisplayStatus: null,
    submissionRound: 0,
    hasSavedEdits: false,
    hasSavedCodeEdits: false,
    displayStatus: 'DRAFT',
    latestJobStatuses: [],
    ...overrides,
})

const ctx = { orgSlug: 'lab', studyId: '01900000-0000-7000-8000-000000000001' }

describe('resolveScreen (researcher)', () => {
    it('results present → study-results (highest precedence)', () => {
        expect(
            resolveScreen('researcher', state({ hasResults: true, codeDecision: 'CODE-APPROVED' }), ctx).screen,
        ).toBe('study-results')
    })
    it('errored job, no reviewer files decision → code-approved, NOT study-results (OTTER-598, 43898)', () => {
        // hasResults is true (JOB-ERRORED ∈ STUDY_RESULTS_JOB_STATUSES) but the error is still hidden
        // from the researcher, so routing must hold on the code-approved page (matching the pill).
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsErrored: true, codeDecision: 'CODE-APPROVED', isExecuting: true }),
                ctx,
            ).screen,
        ).toBe('code-approved')
    })
    it('errored job after a reviewer files decision → study-results (error no longer hidden)', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ hasResults: true, resultsErrored: true, resultsRejected: true, codeDecision: 'CODE-APPROVED' }),
                ctx,
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
                ctx,
            ).screen,
        ).toBe('code-under-review')
    })
    it('approved decision → code-approved', () => {
        expect(resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED' }), ctx).screen).toBe('code-approved')
    })
    it('executing window → code-approved', () => {
        expect(resolveScreen('researcher', state({ isExecuting: true }), ctx).screen).toBe('code-approved')
    })
    it('changes requested → code-feedback', () => {
        const d = resolveScreen('researcher', state({ codeDecision: 'CODE-CHANGES-REQUESTED' }), ctx)
        expect(d.screen).toBe('code-feedback')
    })
    it('awaiting decision → code-under-review', () => {
        expect(
            resolveScreen('researcher', state({ codeAwaitingDecision: true, hasSubmittedCode: true }), ctx).screen,
        ).toBe('code-under-review')
    })
    it('approved proposal, no code → read-only proposal-feedback', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: false }),
                ctx,
            ).screen,
        ).toBe('proposal-feedback')
    })
    it('approved proposal, no code, agreements acked → still proposal-feedback (no code-upload phantom screen)', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: true }),
                ctx,
            ).screen,
        ).toBe('proposal-feedback')
    })
    it('pending review (no job) → study-overview (generic layout)', () => {
        expect(resolveScreen('researcher', state({ status: 'PENDING-REVIEW', isDraft: false }), ctx).screen).toBe(
            'study-overview',
        )
    })
    it('draft → study-overview (generic layout; editing lives on /edit)', () => {
        expect(resolveScreen('researcher', state({ status: 'DRAFT', isDraft: true }), ctx).screen).toBe(
            'study-overview',
        )
    })
    it('CHANGE-REQUESTED → proposal-feedback', () => {
        expect(resolveScreen('researcher', state({ status: 'CHANGE-REQUESTED', isDraft: false }), ctx).screen).toBe(
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
        expect(resolveResearcherCodeScreen(resultsStudy)).toEqual({ screen: 'code-approved', readOnlyCodeStep: true })
    })

    it('picks the code screen by state: changes-requested → code-feedback', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-CHANGES-REQUESTED',
        })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-feedback', readOnlyCodeStep: true })
    })

    it('awaiting decision → code-under-review', () => {
        const s = state({ status: 'APPROVED', isDraft: false, hasSubmittedCode: true, codeAwaitingDecision: true })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-under-review', readOnlyCodeStep: true })
    })

    // OTTER-640: the read-only step marks readOnlyCodeStep so the code screen keeps the submitted code
    // visible while the job runs in the enclave — unlike the live /view flow, which hides it.
    it('marks readOnlyCodeStep for an executing study (code stays visible)', () => {
        const s = state({
            status: 'APPROVED',
            isDraft: false,
            hasSubmittedCode: true,
            codeDecision: 'CODE-APPROVED',
            isExecuting: true,
        })
        expect(resolveResearcherCodeScreen(s)).toEqual({ screen: 'code-approved', readOnlyCodeStep: true })
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

// Reviewer rules are deferred (spec §13): resolveScreen('reviewer', …) currently falls through to
// the researcher table rather than erroring. This pins that contract — when reviewer rules land,
// this test should be updated, not silently start passing for the wrong reason.
describe('resolveScreen (reviewer fall-through, not yet implemented)', () => {
    it('returns a defined descriptor for the reviewer role (researcher fallback for now)', () => {
        const d = resolveScreen('reviewer', state({ status: 'PENDING-REVIEW', isDraft: false }), ctx)
        expect(d.screen).toBeDefined()
    })
})
