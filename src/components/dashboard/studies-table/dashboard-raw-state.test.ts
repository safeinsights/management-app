import { describe, expect, it } from 'vitest'
import type { StudyRow } from './types'
import { dashboardRawStateFromRow } from './dashboard-raw-state'
import { projectStudyState } from '@/lib/study-screen'

const row = (overrides: Partial<StudyRow>): StudyRow => ({
    id: '019000000000-0000-0000-0000-000000000001',
    title: 't',
    status: 'APPROVED',
    createdAt: new Date(),
    submittedAt: null,
    lastUpdatedAt: new Date(),
    reviewerName: null,
    researcherId: 'r',
    reviewerId: null,
    createdBy: null,
    jobStatusChanges: [{ status: 'CODE-SUBMITTED' }, { status: 'CODE-APPROVED' }],
    researcherAgreementsAckedAt: null,
    ...overrides,
})

describe('dashboardRawStateFromRow', () => {
    it('synthesizes a single-job RawStudyState that projects the right code decision', () => {
        const raw = dashboardRawStateFromRow(row({}))
        const state = projectStudyState(raw)
        expect(state.codeDecision).toBe('CODE-APPROVED')
        expect(state.hasSubmittedCode).toBe(true)
    })
    it('maps researcherAgreementsAckedAt', () => {
        const state = projectStudyState(dashboardRawStateFromRow(row({ researcherAgreementsAckedAt: new Date() })))
        expect(state.researcherAgreementsAcked).toBe(true)
    })
    it('no job activity → empty jobs', () => {
        const state = projectStudyState(dashboardRawStateFromRow(row({ jobStatusChanges: [] })))
        expect(state.hasAnyJob).toBe(false)
    })
})
