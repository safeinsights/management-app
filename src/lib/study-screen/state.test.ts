import { describe, expect, it } from 'vitest'
import type { RawStudyState, RawJob } from './state.types'
import {
    isErroredOutputsSharedOutcome,
    isFeedbackOnlyOutcome,
    isOutputsSharedOutcome,
    projectStudyState,
    runErrored,
} from './state'

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
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
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

    // OTTER-641: after the resubmit is approved the same job carries a stale CODE-CHANGES-REQUESTED
    // alongside the live CODE-APPROVED. displayStatus must follow the live decision, not the stale
    // earlier round (which used to win by DISPLAY_STATUS_PRIORITY order).
    it('same-job resubmit then approved → displayStatus is CODE-APPROVED, not the stale changes-requested', () => {
        const approved = job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-APPROVED'])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [approved] }))
        expect(s.codeDecision).toBe('CODE-APPROVED')
        expect(s.codeAwaitingDecision).toBe(false)
        expect(s.displayStatus).toBe('CODE-APPROVED')
    })

    // OTTER-641 symmetry: the same stale-decision drop applies when the resubmit is rejected. The job
    // carries a round-1 CODE-CHANGES-REQUESTED alongside the live terminal CODE-REJECTED, and
    // displayStatus must follow the live rejection (codeDecision ranks CODE-REJECTED above the stale
    // change request), matching the pill's "reads Rejected" case.
    it('same-job resubmit then rejected → displayStatus is CODE-REJECTED, not the stale changes-requested', () => {
        const rejected = job(ID1, ['CODE-SUBMITTED', 'CODE-CHANGES-REQUESTED', 'CODE-SUBMITTED', 'CODE-REJECTED'])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [rejected] }))
        expect(s.codeDecision).toBe('CODE-REJECTED')
        expect(s.codeAwaitingDecision).toBe(false)
        expect(s.displayStatus).toBe('CODE-REJECTED')
    })

    it('approved job then execution starts → displayStatus follows execution, not the code decision', () => {
        const running = job(ID1, [
            'CODE-SUBMITTED',
            'CODE-CHANGES-REQUESTED',
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'JOB-READY',
        ])
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [running] }))
        expect(s.displayStatus).toBe('JOB-READY')
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

    // isExecuting is the LIVE execution window only. Status changes are append-only, so a JOB-RUNNING
    // row survives forever — gating on results keeps "ever ran" from reading as "executing", which had
    // kept the approved/will-run banner showing after the run. A bare JOB-ERRORED stays hidden from the
    // researcher (reviewer triages it), so it must NOT end the window; only a researcher-visible result
    // (RUN-COMPLETE / FILES-APPROVED / FILES-REJECTED) does.
    describe('isExecuting (live execution window)', () => {
        it('running, no results yet → executing', () => {
            const s = projectStudyState(
                raw({ status: 'APPROVED', jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING'])] }),
            )
            expect(s.isExecuting).toBe(true)
        })

        it('ran then completed (RUN-COMPLETE) → no longer executing', () => {
            const s = projectStudyState(
                raw({
                    status: 'APPROVED',
                    jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'RUN-COMPLETE'])],
                }),
            )
            expect(s.isExecuting).toBe(false)
        })

        it('ran then files-approved → no longer executing', () => {
            const s = projectStudyState(
                raw({
                    status: 'APPROVED',
                    jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'FILES-APPROVED'])],
                }),
            )
            expect(s.isExecuting).toBe(false)
        })

        // A bare JOB-ERRORED is hidden from the researcher until a reviewer files a decision, so the
        // window stays live for them — they hold on the code-approved page, not the results screen.
        it('ran then errored, no reviewer decision → still executing (errored result hidden)', () => {
            const s = projectStudyState(
                raw({
                    status: 'APPROVED',
                    jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'JOB-ERRORED'])],
                }),
            )
            expect(s.isExecuting).toBe(true)
        })

        it('errored then reviewer files-rejected → no longer executing (result now visible)', () => {
            const s = projectStudyState(
                raw({
                    status: 'APPROVED',
                    jobs: [
                        job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'JOB-ERRORED', 'FILES-REJECTED']),
                    ],
                }),
            )
            expect(s.isExecuting).toBe(false)
        })

        it('errored then reviewer files-approved → no longer executing (result released to researcher)', () => {
            const s = projectStudyState(
                raw({
                    status: 'APPROVED',
                    jobs: [
                        job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-RUNNING', 'JOB-ERRORED', 'FILES-APPROVED']),
                    ],
                }),
            )
            expect(s.isExecuting).toBe(false)
        })

        it('packaging error (JOB-ERRORED, never ran) → not executing (no running status present)', () => {
            const s = projectStudyState(
                raw({ status: 'APPROVED', jobs: [job(ID1, ['CODE-SUBMITTED', 'CODE-APPROVED', 'JOB-ERRORED'])] }),
            )
            expect(s.isExecuting).toBe(false)
        })
    })

    // OTTER-572: hasStep2Progress is true when any Step 2 field is written, false otherwise.
    it('hasStep2Progress: false for a fresh draft, true once any Step 2 field is set', () => {
        expect(projectStudyState(raw({ status: 'DRAFT' })).hasStep2Progress).toBe(false)
        expect(projectStudyState(raw({ status: 'DRAFT', piUserId: 'pi-1' })).hasStep2Progress).toBe(true)
        expect(projectStudyState(raw({ status: 'DRAFT', datasets: ['ds-1'] })).hasStep2Progress).toBe(true)
        expect(projectStudyState(raw({ status: 'DRAFT', researchQuestions: { q: 1 } })).hasStep2Progress).toBe(true)
        // empty datasets array is not progress
        expect(projectStudyState(raw({ status: 'DRAFT', datasets: [] })).hasStep2Progress).toBe(false)
    })

    // OTTER-572 follow-up: in collaborative mode Step 2 autosaves into Yjs and leaves every column
    // empty until an explicit flush, so the document alone has to count as progress.
    it('hasStep2Progress: true from the collaborative document with every Step 2 column empty', () => {
        const s = projectStudyState(raw({ status: 'DRAFT', hasStep2CollabDoc: true }))
        expect(s.hasStep2Progress).toBe(true)
    })

    // Neither persistence layer clears itself on submit, so the projection has to do the gating:
    // a submitted or decided study is out of the wizard and has no Step 2 to resume.
    it('hasStep2Progress: false for every non-DRAFT status, from either layer', () => {
        const statuses: RawStudyState['status'][] = ['PENDING-REVIEW', 'APPROVED', 'REJECTED', 'CHANGE-REQUESTED']
        for (const status of statuses) {
            expect(projectStudyState(raw({ status, piUserId: 'pi-1' })).hasStep2Progress).toBe(false)
            expect(projectStudyState(raw({ status, hasStep2CollabDoc: true })).hasStep2Progress).toBe(false)
        }
    })
})

describe('runErrored', () => {
    // Narrower than resultsErrored on purpose: a packaging JOB-ERRORED before a good run must not
    // read as a failed run.
    it('separates a failed run from a packaging error that a RUN-COMPLETE followed', () => {
        expect(runErrored(job(ID1, ['JOB-ERRORED']).statusChanges)).toBe(true)
        expect(runErrored(job(ID1, ['JOB-ERRORED', 'RUN-COMPLETE']).statusChanges)).toBe(false)
        expect(runErrored(job(ID1, ['RUN-COMPLETE']).statusChanges)).toBe(false)
        expect(runErrored(job(ID1, ['CODE-SUBMITTED']).statusChanges)).toBe(false)
    })
})

// The three outputs-decision predicates split the reviewer's decision between three researcher
// screens. What matters is not only each one's truth table but that no two ever claim the same
// state — otherwise the rule table's ORDER would silently decide which screen renders, and a future
// reorder would move users between pages. Driven off the projection rather than hand-built
// StudyState literals so a change in how the FILES-*/JOB-ERRORED rows project is caught here too.
describe('outputs-decision predicates are disjoint', () => {
    const PREDICATES = {
        shared: isOutputsSharedOutcome,
        erroredShared: isErroredOutputsSharedOutcome,
        feedbackOnly: isFeedbackOnlyOutcome,
    }

    const OUTCOME_STATUSES = ['RUN-COMPLETE', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED'] as const
    type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]

    const powerSet = <T>(items: readonly T[]): T[][] =>
        items.reduce<T[][]>((sets, item) => [...sets, ...sets.map((set) => [...set, item])], [[]])

    const claimants = (statuses: readonly OutcomeStatus[]) => {
        const s = projectStudyState(raw({ status: 'APPROVED', jobs: [job(ID1, ['CODE-SUBMITTED', ...statuses])] }))
        return Object.entries(PREDICATES)
            .filter(([, predicate]) => predicate(s))
            .map(([name]) => name)
    }

    // The known overlap, expressed as a rule rather than a listed combination: it is EVERY subset
    // carrying an errored run plus both FILES-* rows, which is two of the sixteen (with and without
    // RUN-COMPLETE), not one. Hand-listing it would let the four-status case fail the sweep below.
    const isKnownOverlap = (combo: readonly OutcomeStatus[]) =>
        combo.includes('JOB-ERRORED') && combo.includes('FILES-APPROVED') && combo.includes('FILES-REJECTED')

    // Exhaustive rather than case-by-case (PR #1003 review): the previous tests covered the
    // combinations we happened to think of, so a fourth predicate could have been added without
    // anything failing. This sweeps all 2^4 status subsets.
    // Each row is wrapped so vitest passes the whole combination as ONE argument rather than
    // spreading its statuses across parameters.
    const sweep = powerSet(OUTCOME_STATUSES)
        .filter((combo) => !isKnownOverlap(combo))
        .map((combo) => [combo] as [OutcomeStatus[]])

    it.each(sweep)('at most one predicate claims %j', (statuses) => {
        const claimed = claimants(statuses)
        const label = statuses.join('+') || '(no outcome rows)'
        expect(claimed.length, `${label} claimed by [${claimed}]`).toBeLessThanOrEqual(1)
    })

    // Spot-checks that each predicate claims the state it exists for — disjointness alone would be
    // satisfied by three predicates that never fire.
    it('routes each decided outcome to exactly its own predicate', () => {
        expect(claimants(['RUN-COMPLETE', 'FILES-APPROVED'])).toEqual(['shared'])
        expect(claimants(['JOB-ERRORED', 'FILES-APPROVED'])).toEqual(['erroredShared'])
        expect(claimants(['RUN-COMPLETE', 'FILES-REJECTED'])).toEqual(['feedbackOnly'])
        expect(claimants(['JOB-ERRORED', 'FILES-REJECTED'])).toEqual(['feedbackOnly'])
    })

    it('leaves an undecided run to none of them', () => {
        expect(claimants(['RUN-COMPLETE'])).toEqual([])
        expect(claimants(['JOB-ERRORED'])).toEqual([])
    })

    // Unreachable via submitOutputsDecisionAction, which refuses a second decision on a job, but the
    // QA status route and the legacy approve/reject actions can write both rows.
    it('gives a clean job carrying BOTH FILES-* rows to feedback-only alone, never outputs-shared', () => {
        expect(claimants(['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED'])).toEqual(['feedbackOnly'])
    })

    // The one overlap this card does not own. Excluded from the sweep above and asserted here
    // instead, so the ambiguity stays visible and a future change to either predicate has to
    // acknowledge it rather than silently widening the allow-list.
    it('documents the one remaining overlap: errored + both FILES-* rows', () => {
        expect(claimants(['JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED'])).toEqual([
            'erroredShared',
            'feedbackOnly',
        ])
        expect(claimants(['RUN-COMPLETE', 'JOB-ERRORED', 'FILES-APPROVED', 'FILES-REJECTED'])).toEqual([
            'erroredShared',
            'feedbackOnly',
        ])
    })
})
