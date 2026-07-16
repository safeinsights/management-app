import { describe, expect, it } from 'vitest'
import type { StudyRow } from './types'
import { dashboardRawStateFromRow } from './dashboard-raw-state'
import { projectStudyState, resolveDashboardAction } from '@/lib/study-screen'

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
    proposalRevisionBaseSubmissionId: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
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

    // After a round closes (FILES-APPROVED/REJECTED) a fresh IDE launch opens a new INITIATED-only
    // job, which is the dashboard's latest job. By design the dashboard reflects the CURRENT round
    // ("new submission in progress"), not the prior round's results — so the link sends the
    // researcher to the upload page to re-launch / upload, NOT back to the old results on /view.
    it('fresh INITIATED job after a closed round → link routes to /code (upload), not /view', () => {
        const state = projectStudyState(
            dashboardRawStateFromRow(row({ status: 'APPROVED', jobStatusChanges: [{ status: 'INITIATED' }] })),
        )
        expect(state.hasAnyJob).toBe(true)
        expect(state.hasSubmittedCode).toBe(false)
        expect(state.resultsApproved).toBe(false)

        const action = resolveDashboardAction('researcher', state, {
            orgSlug: 'lab',
            studyId: '01900000-0000-7000-8000-000000000001',
        })
        expect(action.href).toContain('/code')
    })
})
