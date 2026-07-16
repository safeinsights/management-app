import type { StudyJobStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'
import {
    CODE_DECISION_JOB_STATUSES,
    latestSubmittedJobHasLiveCodeDecision,
    STUDY_CODE_RUNNING_JOB_STATUSES,
    STUDY_RESULTS_JOB_STATUSES,
} from '@/lib/study-job-status'
import { draftHasStep2Progress } from '@/lib/studies'
import type { RawJob, RawStudyState, StudyState } from './state.types'

const has = (job: RawJob | undefined, statuses: readonly StudyJobStatus[]): boolean =>
    !!job && job.statusChanges.some((c) => statuses.includes(c.status))

// Fixed priority for the single results value (display only). NOT array order.
const RESULTS_PRIORITY: StudyState['resultsDisplayStatus'][] = [
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
    'RUN-COMPLETE',
]

// Code decision priority: APPROVED is permanent and wins if several ever coexist on the job.
const CODE_DECISION_PRIORITY: CodeDecisionStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED']

// Pill display-status priority (highest-priority PRESENT status on the latest job wins).
// Mirrors useStudyStatus's intent; finer-grained than the screen booleans (keeps exec sub-statuses).
// Which of several coexisting code decisions wins is NOT decided by their order here: callers keep only
// the live codeDecision (see projectStudyState / resolvePillStatus), resolved by CODE_DECISION_PRIORITY.
// So a job carrying an early CODE-CHANGES-REQUESTED plus a later terminal CODE-APPROVED / CODE-REJECTED
// reads Approved / Rejected (the truthful terminal state), not the stale earlier round. The relative
// order of the three decision statuses below is therefore immaterial; only their position relative to
// the JOB-*/CODE-SUBMITTED entries matters.
export const DISPLAY_STATUS_PRIORITY: StudyJobStatus[] = [
    'JOB-ERRORED',
    'FILES-REJECTED',
    'FILES-APPROVED',
    'RUN-COMPLETE',
    'JOB-RUNNING',
    'JOB-READY',
    'JOB-PACKAGING',
    'JOB-PROVISIONING',
    'CODE-REJECTED',
    'CODE-CHANGES-REQUESTED',
    'CODE-APPROVED',
    'CODE-SCANNED',
    'CODE-SUBMITTED',
    'INITIATED',
]

function latestJob(jobs: ReadonlyArray<RawJob>): RawJob | undefined {
    if (jobs.length === 0) return undefined
    // max(id): v7 ids are insertion-ordered, so lexical max === most recently created round.
    // Prefer the latest job that has been submitted (has a non-INITIATED status), matching the
    // legacy latestSubmittedJobForStudy anchor. A baseline-only INITIATED job (IDE launch / file
    // upload) that lands after a reviewed submission must not mask the code decision.
    const submitted = jobs.filter((j) => j.statusChanges.some((c) => c.status !== 'INITIATED'))
    const pool = submitted.length > 0 ? submitted : jobs
    return pool.reduce((a, b) => (b.id > a.id ? b : a))
}

// A code-decision status is "stale" once it is no longer the live decision: an earlier round's
// CODE-CHANGES-REQUESTED superseded by a later approval/rejection on the same job, or any decision while
// none is live (mid-resubmission, liveDecision null). Dropping stale decisions makes the pill and
// displayStatus follow the live codeDecision, never a prior round's. Shared by projectStudyState and
// resolvePillStatus so the two can't drift (OTTER-641).
export const isStaleCodeDecision = (status: StudyJobStatus, liveDecision: CodeDecisionStatus | null): boolean =>
    CODE_DECISION_JOB_STATUSES.includes(status as CodeDecisionStatus) && status !== liveDecision

export function projectStudyState(raw: RawStudyState): StudyState {
    const job = latestJob(raw.jobs)
    const jobStatuses = new Set<StudyJobStatus>(job?.statusChanges.map((c) => c.status) ?? [])

    // A decision is live only when decisions >= submissions on the latest job. Reuse the single
    // source of truth (latestSubmittedJobHasLiveCodeDecision) shared with reviewer routing and dashboard
    // highlighting so a same-job resubmit after CODE-CHANGES-REQUESTED (which appends a fresh
    // CODE-SUBMITTED, tipping submitted-count past decision-count) can't drift between those surfaces.
    const hasLiveDecision = latestSubmittedJobHasLiveCodeDecision(job?.statusChanges ?? [])
    const codeDecision = hasLiveDecision ? (CODE_DECISION_PRIORITY.find((d) => jobStatuses.has(d)) ?? null) : null
    // Intentionally CODE-SUBMITTED only (legacy gated on ['CODE-SUBMITTED','CODE-SCANNED']): the scan
    // is an automated step, never present without a preceding CODE-SUBMITTED on the same job, so
    // adding it would not change the result — keep this anchored on the actual submission event.
    const hasSubmittedCode = jobStatuses.has('CODE-SUBMITTED')
    const codeAwaitingDecision = hasSubmittedCode && codeDecision === null
    const hasResults = has(job, STUDY_RESULTS_JOB_STATUSES)
    const resultsApproved = jobStatuses.has('FILES-APPROVED')
    const resultsRejected = jobStatuses.has('FILES-REJECTED')
    const resultsErrored = jobStatuses.has('JOB-ERRORED')
    const resultsDisplayStatus = RESULTS_PRIORITY.find((r) => r && jobStatuses.has(r)) ?? null

    // The execution window is LIVE-only: status changes are append-only, so a job that ran then
    // completed/errored keeps its JOB-RUNNING row forever — gating on results stops isExecuting from
    // meaning "ever ran" (which kept showing the approved/will-run banner after the run). A bare
    // JOB-ERRORED stays hidden from the researcher (the reviewer triages it), so it must NOT end the
    // window: only a researcher-visible result (RUN-COMPLETE / FILES-APPROVED / FILES-REJECTED) does.
    const erroredResultHidden = isErroredResultHiddenFromResearcher({
        resultsErrored,
        resultsApproved,
        resultsRejected,
    })
    const isExecuting = has(job, STUDY_CODE_RUNNING_JOB_STATUSES) && (!hasResults || erroredResultHidden)

    // displayStatus: pick the highest-priority present status, but let a code decision through only when
    // it is the live one (see isStaleCodeDecision), so DISPLAY_STATUS_PRIORITY's ordering never picks
    // among coexisting decisions. Fall back to study status when the job carries none.
    const visible = DISPLAY_STATUS_PRIORITY.filter(
        (st) => jobStatuses.has(st) && !isStaleCodeDecision(st, codeDecision),
    )
    const displayStatus: AllStatus = visible[0] ?? raw.status

    // Count of jobs that ever carried a submission = which submission round this is across ALL jobs.
    // Distinct from the user-facing displayed version (round-opening events across the study + 1, see
    // codeSubmissionVersion): do NOT use this as the user-facing version. Currently has no consumer
    // outside this module/tests — kept as the one deliberate cross-job fact (see state.types.ts).
    const submissionRound = raw.jobs.filter((j) => j.statusChanges.some((c) => c.status === 'CODE-SUBMITTED')).length

    return {
        status: raw.status,
        isDraft: raw.status === 'DRAFT',
        proposalDraftInProgress: raw.status === 'CHANGE-REQUESTED' && raw.proposalEditedAt != null,
        hasStep2Progress: draftHasStep2Progress(raw),
        researcherAgreementsAcked: !!raw.researcherAgreementsAckedAt,
        reviewerAgreementsAcked: !!raw.reviewerAgreementsAckedAt,
        hasAnyJob: raw.jobs.length > 0,
        hasSubmittedCode,
        codeDecision,
        codeAwaitingDecision,
        isExecuting,
        hasResults,
        resultsApproved,
        resultsRejected,
        resultsErrored,
        resultsDisplayStatus,
        submissionRound,
        hasSavedEdits: !!raw.proposalResubmissionNoteDraft,
        hasSavedCodeEdits: !!raw.codeResubmissionNoteDraft,
        displayStatus,
        latestJobStatuses: [...jobStatuses].sort(), // stable order for deterministic output/tests
    }
}

// OTTER-598 follow-up: a JOB-ERRORED result stays hidden from the RESEARCHER until a reviewer records
// a FILES-* decision (errored-result triage is the reviewer's). While hidden, the researcher's pill
// reads "Code approved" (resolvePillStatus's hideErrored) and the /view screen must hold on the
// code-approved page — NOT jump to the results/Study Details screen. Single source of truth shared by
// the pill and RESEARCHER_SCREEN_RULES so the two can't drift (the mismatch QA re-reported in 43898).
export const isErroredResultHiddenFromResearcher = (
    s: Pick<StudyState, 'resultsErrored' | 'resultsApproved' | 'resultsRejected'>,
): boolean => s.resultsErrored && !s.resultsApproved && !s.resultsRejected
