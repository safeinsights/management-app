import { describe, it, expect } from 'vitest'
import type { RawJob, RawStudyState } from './state.types'
import { projectStudyState } from './state'
import { canResearcherResubmitCode } from './eligibility'

const job = (id: string, statuses: string[]): RawJob => ({
    id,
    statusChanges: statuses.map((status) => ({ status: status as RawJob['statusChanges'][number]['status'] })),
})

const stateFor = (jobs: RawJob[]): RawStudyState => ({
    status: 'APPROVED',
    approvedAt: null,
    rejectedAt: null,
    researcherAgreementsAckedAt: null,
    reviewerAgreementsAckedAt: null,
    proposalResubmissionNoteDraft: null,
    codeResubmissionNoteDraft: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
    jobs,
})

const canResubmit = (jobs: RawJob[]) => canResearcherResubmitCode(projectStudyState(stateFor(jobs)))

const ID = '019000000000-0000-0000-0000-000000000001'
const ID2 = '019000000000-0000-0000-0000-000000000002'

describe('canResearcherResubmitCode', () => {
    it('true for a live CODE-CHANGES-REQUESTED decision', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])])).toBe(true)
    })

    it('false when CODE-CHANGES-REQUESTED is stale (a fresh CODE-SUBMITTED was appended)', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'])])).toBe(false)
    })

    it('true for FILES-APPROVED even when a later CODE-SCANNED sorts first (the QA video scenario)', () => {
        expect(
            canResubmit([
                job(ID, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED']),
            ]),
        ).toBe(true)
    })

    it('true for FILES-REJECTED', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED'])])).toBe(true)
    })

    it('false for a code-approved study with no results decision yet', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-APPROVED'])])).toBe(false)
    })

    it('false for a terminal CODE-REJECTED', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-REJECTED'])])).toBe(false)
    })

    it('false while code is awaiting a first decision', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-SCANNED'])])).toBe(false)
    })

    // The reviewer must record a FILES-* decision on the errored run before resubmit is offered.
    it('false for a bare JOB-ERRORED run awaiting the reviewer files decision', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'JOB-ERRORED'])])).toBe(false)
    })

    it('true once an errored run is decided FILES-REJECTED', () => {
        expect(
            canResubmit([job(ID, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'JOB-ERRORED', 'FILES-REJECTED'])]),
        ).toBe(true)
    })

    it('false with no jobs', () => {
        expect(canResubmit([])).toBe(false)
    })

    it('true from the latest submitted round when a prior round closed with FILES-APPROVED', () => {
        expect(
            canResubmit([
                job(ID, ['CODE-SUBMITTED', 'FILES-APPROVED']),
                job(ID2, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED']),
            ]),
        ).toBe(true)
    })

    // A mid-resubmit upload opens a baseline INITIATED-only job, which latestJob's prefer-submitted
    // filter must skip so eligibility still reads the last submitted round (OTTER-601).
    it('true when a later baseline-only INITIATED job trails a FILES-APPROVED round', () => {
        expect(canResubmit([job(ID, ['CODE-SUBMITTED', 'FILES-APPROVED']), job(ID2, ['INITIATED'])])).toBe(true)
    })
})
