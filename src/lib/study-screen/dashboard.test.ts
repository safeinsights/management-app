import { describe, expect, it } from 'vitest'
import type { DashboardState } from './state.types'
import { resolveDashboardAction } from './resolve'
import { studyState } from './state.fixture'

// DashboardState is StudyState minus the facts the dashboard query doesn't fetch, so the shared
// fixture satisfies it.
const dstate = (overrides: Partial<DashboardState>): DashboardState => studyState(overrides)

const ctx = { orgSlug: 'lab', studyId: '01900000-0000-7000-8000-000000000001' }

describe('resolveDashboardAction (researcher)', () => {
    it('draft → Edit + delete-draft + /edit', () => {
        const a = resolveDashboardAction('researcher', dstate({ isDraft: true }), ctx)
        expect(a.label).toBe('Edit')
        expect(a.secondaryAction).toBe('delete-draft')
        expect(a.href).toContain('/edit')
    })
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
    // Must fall through to /submitted: they are not sent to /code before acking.
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
