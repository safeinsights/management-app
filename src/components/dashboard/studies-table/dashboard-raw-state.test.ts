import { describe, expect, it } from 'vitest'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import type { Audience, StudyRow } from './types'
import { dashboardRawStateFromRow, lastBadgeChangeAt, rowStudyState } from './dashboard-raw-state'
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

describe('lastBadgeChangeAt', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute))
    const history = (...statuses: StudyJobStatus[]) =>
        statuses.map((status, i) => ({ status, createdAt: at(i + 1).toISOString() }))
    const changedAt = (audience: Audience, jobStatusChanges: StudyRow['jobStatusChanges']) =>
        lastBadgeChangeAt(row({ status: 'APPROVED', jobStatusChanges }), audience)

    it('moves both dates when the lab opens a code round', () => {
        const opened = history('INITIATED')
        expect(changedAt('researcher', opened)).toEqual(at(1))
        expect(changedAt('reviewer', opened)).toEqual(at(1))
    })

    it('counts the run start for the researcher and every run stage for the reviewer', () => {
        const running = history('CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-PACKAGING', 'JOB-RUNNING')
        expect(changedAt('researcher', running)).toEqual(at(3))
        expect(changedAt('reviewer', running)).toEqual(at(4))
    })

    it('counts a completed run for both audiences', () => {
        const complete = history('CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-PACKAGING', 'JOB-RUNNING', 'RUN-COMPLETE')
        expect(changedAt('researcher', complete)).toEqual(at(5))
        expect(changedAt('reviewer', complete)).toEqual(at(5))
    })

    it('counts an errored run, and then its released decision, for both audiences', () => {
        const errored = history('CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-PACKAGING', 'JOB-RUNNING', 'JOB-ERRORED')
        expect(changedAt('researcher', errored)).toEqual(at(5))
        expect(changedAt('reviewer', errored)).toEqual(at(5))

        const decided = [...errored, { status: 'FILES-REJECTED' as const, createdAt: at(6).toISOString() }]
        expect(changedAt('researcher', decided)).toEqual(at(6))
        expect(changedAt('reviewer', decided)).toEqual(at(6))
    })

    it('counts the lab opening released outputs for the researcher only', () => {
        const viewed = history(
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'JOB-RUNNING',
            'RUN-COMPLETE',
            'FILES-APPROVED',
            'RESULTS-VIEWED',
        )
        expect(changedAt('researcher', viewed)).toEqual(at(6))
        expect(changedAt('reviewer', viewed)).toEqual(at(5))
    })

    it('ignores a row that leaves the badge as it was', () => {
        const queued = history('CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING')
        expect(changedAt('reviewer', queued)).toEqual(at(4))

        const scanned = history('CODE-SUBMITTED', 'CODE-SCANNED')
        expect(changedAt('researcher', scanned)).toEqual(at(1))
        expect(changedAt('reviewer', scanned)).toEqual(at(1))
    })

    it('treats rows written together as one step', () => {
        const together = [
            { status: 'CODE-SUBMITTED' as const, createdAt: at(1).toISOString() },
            { status: 'CODE-APPROVED' as const, createdAt: at(2).toISOString() },
            { status: 'JOB-READY' as const, createdAt: at(2).toISOString() },
        ]
        expect(changedAt('reviewer', together)).toEqual(at(2))
    })

    it('returns null without a timed history', () => {
        expect(changedAt('researcher', [])).toBeNull()
        expect(changedAt('researcher', [{ status: 'CODE-SUBMITTED' }])).toBeNull()
    })
})
