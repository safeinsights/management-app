import { describe, expect, it } from 'vitest'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import type { Audience, StudyRow } from './types'
import { dashboardRawStateFromRow, rowStudyState } from './dashboard-raw-state'
import { projectStudyState, resolveDashboardAction, resolvePillStatus } from '@/lib/study-screen'

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
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
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
    it('maps hasStep2CollabDoc into Step 2 progress', () => {
        expect(projectStudyState(dashboardRawStateFromRow(row({ status: 'DRAFT' }))).hasStep2Progress).toBe(false)
        const state = projectStudyState(dashboardRawStateFromRow(row({ status: 'DRAFT', hasStep2CollabDoc: true })))
        expect(state.hasStep2Progress).toBe(true)
    })
    it('no job activity → empty jobs', () => {
        const state = projectStudyState(dashboardRawStateFromRow(row({ jobStatusChanges: [] })))
        expect(state.hasAnyJob).toBe(false)
    })

    // The dashboard reflects the CURRENT round, not the prior round's results, so a fresh IDE
    // launch after a closed round links to upload rather than the old results.
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

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }

// Proves a StudyRow reaches the right pill; the rule matrix itself lives in pill.test.ts.
const pill = (status: StudyStatus, audience: Audience, jobStatusChanges: Array<{ status: StudyJobStatus }> = []) =>
    resolvePillStatus(audience, rowStudyState(row({ status, jobStatusChanges })), NAMES)

describe('row pill', () => {
    it('reads the study status when the study has no jobs', () => {
        expect(pill('PENDING-REVIEW', 'researcher')).toMatchObject({
            id: 'proposal-submitted',
            label: 'Proposal submitted',
            tooltip: 'Waiting for Openstax to review proposal.',
        })
    })

    it('reads the job statuses, including the RESULTS-VIEWED row, once jobs exist', () => {
        const decided: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'RUN-COMPLETE' },
            { status: 'FILES-APPROVED' },
        ]
        expect(pill('APPROVED', 'researcher', decided).id).toBe('outputs-need-review')
        expect(pill('APPROVED', 'researcher', [...decided, { status: 'RESULTS-VIEWED' }]).id).toBe('outputs-reviewed')
    })
})
