import { describe, expect, it } from 'vitest'
import type { StudyState } from './state.types'
import { resolveScreen } from './resolve'

const ctx = { orgSlug: 'org', studyId: '01900000-0000-7000-8000-000000000001' }

const st = (overrides: Partial<StudyState>): StudyState => ({
    status: 'PENDING-REVIEW',
    isDraft: false,
    isProposalRevisionDraft: false,
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
    displayStatus: 'PENDING-REVIEW',
    latestJobStatuses: [],
    ...overrides,
})

const screen = (s: StudyState) => resolveScreen('reviewer', s, ctx).screen

describe('resolveScreen(reviewer)', () => {
    it('PENDING-REVIEW → reviewer-proposal-review', () => {
        expect(screen(st({ status: 'PENDING-REVIEW' }))).toBe('reviewer-proposal-review')
    })

    it('decided proposal, no code → reviewer-proposal-feedback', () => {
        expect(screen(st({ status: 'APPROVED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'REJECTED' }))).toBe('reviewer-proposal-feedback')
        expect(screen(st({ status: 'CHANGE-REQUESTED' }))).toBe('reviewer-proposal-feedback')
    })

    // OTTER-636: a revision draft (a change-requested proposal being edited) reads DRAFT but must show
    // the reviewer the read-only submitted feedback, never a fresh-draft/study-overview fallback.
    it('revision draft → reviewer-proposal-feedback (read-only, not actionable)', () => {
        expect(screen(st({ status: 'DRAFT', isDraft: true, isProposalRevisionDraft: true }))).toBe(
            'reviewer-proposal-feedback',
        )
    })

    // A fresh draft has no submitted history and should not reach a reviewer screen beyond the safe
    // overview fallback (the page guard 404s it first).
    it('fresh draft → study-overview fallback', () => {
        expect(screen(st({ status: 'DRAFT', isDraft: true, isProposalRevisionDraft: false }))).toBe('study-overview')
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

    it('results out-rank a present code decision → reviewer-study-results', () => {
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
        ).toBe('reviewer-study-results')
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
