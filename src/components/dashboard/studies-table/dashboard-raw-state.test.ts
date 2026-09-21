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

// These start from raw job statuses, so they cover the projection and the pill tables together;
// pill.test.ts covers the tables on their own, from a hand-built StudyState.
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

    it('lets the job phase outrank the study status', () => {
        const result = pill('APPROVED', 'researcher', [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'RUN-COMPLETE' },
        ])
        expect(result.id).toBe('outputs-awaiting')
    })

    it('gives the two audiences different labels for the same study', () => {
        const changes: Array<{ status: StudyJobStatus }> = [{ status: 'CODE-SUBMITTED' }]
        expect(pill('APPROVED', 'researcher', changes).label).toBe('Code submitted')
        expect(pill('APPROVED', 'reviewer', changes).label).toBe('Code needs review')
    })

    // OTTER-598: the researcher must not learn a run failed before the reviewer has triaged it.
    describe('error disclosure', () => {
        const errored: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'JOB-ERRORED' },
        ]

        it('hides the failure from the researcher until a decision exists', () => {
            expect(pill('APPROVED', 'researcher', errored).label).toBe('Awaiting outputs')
        })

        it('shows the failure to the researcher once the reviewer shares a decision', () => {
            const decided = [...errored, { status: 'FILES-APPROVED' as StudyJobStatus }]
            expect(pill('APPROVED', 'researcher', decided).label).toBe('Code errored')
        })

        it('shows the failure to the reviewer immediately', () => {
            expect(pill('APPROVED', 'reviewer', errored).label).toBe('Code errored')
        })
    })

    // OTTER-641: a resubmission must clear the previous round's decision from the pill.
    it('reads a resubmission as under review, not as the previous change request', () => {
        const resubmitted: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-CHANGES-REQUESTED' },
            { status: 'CODE-SUBMITTED' },
        ]
        expect(pill('APPROVED', 'reviewer', resubmitted).label).toBe('Code needs review')
        expect(pill('APPROVED', 'researcher', resubmitted).label).toBe('Code submitted')
    })

    it('still reads a change request when no newer submission exists', () => {
        const changes: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-CHANGES-REQUESTED' },
        ]
        expect(pill('APPROVED', 'researcher', changes).label).toBe('Code needs revision')
        expect(pill('APPROVED', 'reviewer', changes).label).toBe('Code revision requested')
    })

    it('reads the furthest enclave stage for the reviewer and one processing label for the researcher', () => {
        const running: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'JOB-PACKAGING' },
            { status: 'JOB-READY' },
            { status: 'JOB-PROVISIONING' },
        ]
        expect(pill('APPROVED', 'reviewer', running).label).toBe('Code queued')
        expect(pill('APPROVED', 'researcher', running).label).toBe('Code processing')
    })

    // OTTER-698: the only pill fact the lifecycle statuses cannot carry, so RESULTS-VIEWED records it.
    describe('outputs decision', () => {
        const decided: Array<{ status: StudyJobStatus }> = [
            { status: 'CODE-SUBMITTED' },
            { status: 'CODE-APPROVED' },
            { status: 'RUN-COMPLETE' },
            { status: 'FILES-APPROVED' },
        ]

        it('reads as needing review until the researcher opens it', () => {
            expect(pill('APPROVED', 'researcher', decided).label).toBe('Outputs need review')
        })

        it('reads as reviewed once the researcher has opened it', () => {
            const viewed = [...decided, { status: 'RESULTS-VIEWED' as StudyJobStatus }]
            const result = pill('APPROVED', 'researcher', viewed)
            expect(result.label).toBe('Outputs reviewed')
            expect(result.tooltip).toBe(
                'You have reviewed the decision on your outputs. You can resubmit code if needed.',
            )
        })

        it('reads as reviewed to the reviewer, who made the decision', () => {
            const result = pill('APPROVED', 'reviewer', decided)
            expect(result.label).toBe('Outputs reviewed')
            expect(result.tooltip).toBe('A decision on the outputs has been shared with Openstax Lab.')
        })
    })

    it('falls back to a draft pill for a study with no status the rules claim', () => {
        expect(pill('ARCHIVED', 'researcher').label).toBe('Proposal draft')
    })
})
