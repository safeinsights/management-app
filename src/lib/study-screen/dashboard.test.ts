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
    it('draft → Edit + delete-draft', () => {
        const a = resolveDashboardAction('researcher', dstate({ isDraft: true }), ctx)
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBe('delete-draft')
        expect(a.href).toContain('/edit')
    })
    it('approved, has job, no code → Continue upload', () => {
        const a = resolveDashboardAction(
            'researcher',
            dstate({ status: 'APPROVED', isDraft: false, hasAnyJob: true, hasSubmittedCode: false }),
            ctx,
        )
        expect(a.label).toBe('Continue upload')
        expect(a.href).toContain('/code')
    })
    it('everything else → View', () => {
        const a = resolveDashboardAction('researcher', dstate({ status: 'PENDING-REVIEW', isDraft: false }), ctx)
        expect(a.label).toBe('View')
        expect(a.href).toContain('/view')
    })
})
