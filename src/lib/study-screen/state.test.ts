import { describe, expect, it } from 'vitest'
import type { RawStudyState, RawJob } from './state.types'
import { projectStudyState } from './state'

const job = (id: string, statuses: string[]): RawJob => ({
    id,
    statusChanges: statuses.map((status) => ({ status: status as RawJob['statusChanges'][number]['status'] })),
})

const raw = (overrides: Partial<RawStudyState> = {}): RawStudyState => ({
    status: 'DRAFT',
    approvedAt: null,
    rejectedAt: null,
    researcherAgreementsAckedAt: null,
    reviewerAgreementsAckedAt: null,
    proposalResubmissionNoteDraft: null,
    codeResubmissionNoteDraft: null,
    jobs: [],
    ...overrides,
})

// v7 ids are insertion-ordered; use lexically-increasing ids so max(id) === latest round.
const ID1 = '019000000000-0000-0000-0000-000000000001'
const ID2 = '019000000000-0000-0000-0000-000000000002'

describe('projectStudyState', () => {
    it('empty study (no jobs) → all job/results facts false, draft true', () => {
        const s = projectStudyState(raw({ status: 'DRAFT' }))
        expect(s.hasAnyJob).toBe(false)
        expect(s.hasSubmittedCode).toBe(false)
        expect(s.codeDecision).toBeNull()
        expect(s.codeAwaitingDecision).toBe(false)
        expect(s.hasResults).toBe(false)
        expect(s.isDraft).toBe(true)
        expect(s.submissionRound).toBe(0)
        expect(s.displayStatus).toBe('DRAFT')
        expect(s.latestJobStatuses).toEqual([])
    })

    it('CODE-APPROVED stays approved even with a later CODE-SCANNED on the same job', () => {
        const s = projectStudyState(
            raw({ status: 'APPROVED', jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'CODE-SCANNED'])] }),
        )
        expect(s.codeDecision).toBe('CODE-APPROVED')
        expect(s.codeAwaitingDecision).toBe(false)
    })

    it('resubmission: older approved job + newer submitted-only job → awaiting on latest, not masked', () => {
        const older = job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED'])
        const newer = job(ID2, ['CODE-SUBMITTED'])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [older, newer] }))
        expect(s.codeDecision).toBeNull()
        expect(s.codeAwaitingDecision).toBe(true)
        expect(s.submissionRound).toBe(2)
    })

    // Same-job resubmit after CODE-CHANGES-REQUESTED: the round-boundary fix reuses the job, and a
    // resubmit now appends a SECOND CODE-SUBMITTED (CODE-SUBMITTED is an append-only submission
    // event). submittedCount(2) > decisionCount(1), so the prior decision is no longer live — the
    // researcher is back under review, not stuck on the edit/feedback screen.
    it('same-job resubmit after changes-requested → awaiting decision, decision no longer live', () => {
        const resubmitted = job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED'])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [resubmitted] }))
        expect(s.codeDecision).toBeNull()
        expect(s.codeAwaitingDecision).toBe(true)
    })

    it('agreements acked booleans map from the two columns', () => {
        const s = projectStudyState(raw({ researcherAgreementsAckedAt: new Date(), reviewerAgreementsAckedAt: null }))
        expect(s.researcherAgreementsAcked).toBe(true)
        expect(s.reviewerAgreementsAcked).toBe(false)
    })

    it('hasSavedEdits / hasSavedCodeEdits read the draft-note columns', () => {
        const s = projectStudyState(raw({ proposalResubmissionNoteDraft: 'wip', codeResubmissionNoteDraft: null }))
        expect(s.hasSavedEdits).toBe(true)
        expect(s.hasSavedCodeEdits).toBe(false)
    })

    it('results present → hasResults and the right boolean, latest job only', () => {
        const s = projectStudyState(
            raw({ status: 'APPROVED', jobs: [job(ID2, ['CODE-SUBMITTED', 'CODE-APPROVED', 'FILES-APPROVED'])] }),
        )
        expect(s.hasResults).toBe(true)
        expect(s.resultsApproved).toBe(true)
        expect(s.resultsDisplayStatus).toBe('FILES-APPROVED')
        expect(s.latestJobStatuses).toContain('FILES-APPROVED')
    })
})
