import { describe, expect, it } from 'vitest'
import type { DashboardState } from './state.types'
import { resolveDashboardAction } from './resolve'

const dstate = (overrides: Partial<DashboardState>): DashboardState => ({
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
