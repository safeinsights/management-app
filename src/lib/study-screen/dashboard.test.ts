import { describe, expect, it } from 'vitest'
import type { DashboardState } from './state.types'
import { resolveDashboardAction } from './resolve'

const dstate = (overrides: Partial<DashboardState>): DashboardState => ({
    status: 'DRAFT',
    isDraft: true,
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
    displayStatus: 'DRAFT',
    latestJobStatuses: [],
    ...overrides,
})

const ctx = { orgSlug: 'lab', studyId: '01900000-0000-7000-8000-000000000001' }

describe('resolveDashboardAction (researcher)', () => {
    it('draft → Edit + delete-draft + /edit', () => {
        const a = resolveDashboardAction('researcher', dstate({ isDraft: true }), ctx)
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBe('delete-draft')
        expect(a.href).toContain('/edit')
    })
    // OTTER-636: a revision draft resumes on the edit-and-resubmit flow and offers NO delete (it has
    // submitted history). Must win over the plain-draft rules even though it is also isDraft.
    it('revision draft → Edit + /edit-and-resubmit, no delete-draft', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'DRAFT', isDraft: true, isProposalRevisionDraft: true, hasStep2Progress: true }),
            ctx,
        )
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBeUndefined()
        expect(a.href).toContain('/edit-and-resubmit')
    })
    // OTTER-572: a draft that has reached Step 2 resumes on the proposal editor (Step 2), not the
    // Step 1 data-partner picker. Step 1 destination is /edit, Step 2 is /proposal.
    it('draft with Step 2 progress → Edit + delete-draft + /proposal (resume on Step 2)', () => {
        const a = resolveDashboardAction('researcher', dstate({ isDraft: true, hasStep2Progress: true }), ctx)
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBe('delete-draft')
        expect(a.href).toContain('/proposal')
        expect(a.href).not.toContain('/edit')
    })
    it('APPROVED with a baseline job, no code submitted → View → /code', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: true, hasSubmittedCode: false }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/code')
    })
    it('job activity with code submitted → View → /view', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: true, hasSubmittedCode: true }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/view')
    })
    it('APPROVED, agreements acked, no job → View → /code', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: false, researcherAgreementsAcked: true }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/code')
    })
    // Negative of the rule above: APPROVED with NO job and agreements NOT acked must fall through the
    // code-upload rules to /submitted (the OTTER boundary — don't send them to /code before they ack).
    it('APPROVED, agreements NOT acked, no job → View → /submitted', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: false, researcherAgreementsAcked: false }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/submitted')
    })
    it('REJECTED with job activity → View → /view', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'REJECTED', isDraft: false, hasAnyJob: true }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/view')
    })
    it('PENDING-REVIEW, no job → View → /submitted', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'PENDING-REVIEW', isDraft: false, hasAnyJob: false }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/submitted')
    })
    it('CHANGE-REQUESTED, no job → View → /submitted', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'CHANGE-REQUESTED', isDraft: false, hasAnyJob: false }),
            ctx,
        )
        expect(a.label).toBe('View')
        expect(a.href).toContain('/submitted')
    })
})
