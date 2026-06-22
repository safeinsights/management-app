import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen } from './resolve'

const state = (overrides: Partial<StudyState>): StudyState => ({
    status: 'DRAFT',
    isDraft: true,
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
            resolveScreen('researcher', state({ hasResults: true, codeDecision: 'CODE-APPROVED' }), undefined, ctx)
                .screen,
        ).toBe('study-results')
    })
    it('approved decision → code-approved', () => {
        expect(resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED' }), undefined, ctx).screen).toBe(
            'code-approved',
        )
    })
    it('executing window → code-approved', () => {
        expect(resolveScreen('researcher', state({ isExecuting: true }), undefined, ctx).screen).toBe('code-approved')
    })
    it('changes requested → code-feedback with Edit and resubmit forward', () => {
        const d = resolveScreen('researcher', state({ codeDecision: 'CODE-CHANGES-REQUESTED' }), undefined, ctx)
        expect(d.screen).toBe('code-feedback')
        expect(d.forward?.title).toBe('Edit and resubmit')
    })
    it('awaiting decision → code-under-review', () => {
        expect(
            resolveScreen('researcher', state({ codeAwaitingDecision: true, hasSubmittedCode: true }), undefined, ctx)
                .screen,
        ).toBe('code-under-review')
    })
    it('approved proposal, no code, agreements not acked → agreements', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: false }),
                undefined,
                ctx,
            ).screen,
        ).toBe('agreements')
    })
    it('approved proposal, no code, agreements acked → code-upload', () => {
        expect(
            resolveScreen(
                'researcher',
                state({ status: 'APPROVED', isDraft: false, researcherAgreementsAcked: true }),
                undefined,
                ctx,
            ).screen,
        ).toBe('code-upload')
    })
    it('pending review → proposal-submitted', () => {
        expect(
            resolveScreen('researcher', state({ status: 'PENDING-REVIEW', isDraft: false }), undefined, ctx).screen,
        ).toBe('proposal-submitted')
    })
    it('draft → study-overview (generic layout; editing lives on /edit)', () => {
        expect(resolveScreen('researcher', state({ status: 'DRAFT', isDraft: true }), undefined, ctx).screen).toBe(
            'study-overview',
        )
    })
    it('CHANGE-REQUESTED proposal-feedback is read-only (no forward; back to dashboard)', () => {
        const d = resolveScreen('researcher', state({ status: 'CHANGE-REQUESTED', isDraft: false }), undefined, ctx)
        expect(d.screen).toBe('proposal-feedback')
        expect(d.forward).toBeUndefined()
        expect(d.back?.title).toBe('Go to dashboard')
    })
    it('study-results is terminal: no back link (avoids /view self-loop)', () => {
        const d = resolveScreen('researcher', state({ hasResults: true }), undefined, { ...ctx, returnTo: 'org' })
        expect(d.screen).toBe('study-results')
        expect(d.back).toBeUndefined()
    })
    it('code-approved back link targets /agreements with NO from=', () => {
        const d = resolveScreen('researcher', state({ codeDecision: 'CODE-APPROVED' }), undefined, ctx)
        expect(d.back?.target.kind).toBe('route')
        const href = d.back?.target.kind === 'route' ? d.back.target.href : ''
        expect(href).toContain('/agreements')
        expect(href).not.toContain('from=')
    })
    it('code-under-review back link targets /agreements with NO from=', () => {
        const d = resolveScreen(
            'researcher',
            state({ codeAwaitingDecision: true, hasSubmittedCode: true }),
            undefined,
            ctx,
        )
        expect(d.back?.target.kind).toBe('route')
        const href = d.back?.target.kind === 'route' ? d.back.target.href : ''
        expect(href).toContain('/agreements')
        expect(href).not.toContain('from=')
    })
    it('dashboard forward honors returnTo (org dashboard)', () => {
        const d = resolveScreen('researcher', state({ status: 'PENDING-REVIEW', isDraft: false }), undefined, {
            ...ctx,
            returnTo: 'org',
        })
        // proposal-submitted forward is "Go to dashboard"
        expect(d.forward?.title).toBe('Go to dashboard')
        const href = d.forward?.target.kind === 'route' ? d.forward.target.href : ''
        expect(href).toContain('/lab/dashboard') // orgDashboard for returnTo=org
    })
})
