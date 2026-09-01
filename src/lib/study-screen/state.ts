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
import type { ResearcherScreenId, ScreenId } from './screens'
import type { RawJob, RawStudyState, StudyState } from './state.types'

const has = (job: RawJob | undefined, statuses: readonly StudyJobStatus[]): boolean =>
    !!job && job.statusChanges.some((c) => statuses.includes(c.status))

// Fixed priority, NOT array order.
const RESULTS_PRIORITY: StudyState['resultsDisplayStatus'][] = [
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
    'RUN-COMPLETE',
]

// APPROVED is permanent and wins if several ever coexist on the job.
const CODE_DECISION_PRIORITY: CodeDecisionStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED']

// Callers keep only the live code decision, so the three decisions' order among themselves is
// immaterial here.
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

// Exported so consumers read a display fact from the SAME job the projection decided on.
export function latestJob(jobs: ReadonlyArray<RawJob>): RawJob | undefined {
    if (jobs.length === 0) return undefined
    // v7 ids are insertion-ordered, so lexical max is the most recent round. Submitted jobs win so
    // a baseline-only INITIATED job cannot mask the code decision.
    const submitted = jobs.filter((j) => j.statusChanges.some((c) => c.status !== 'INITIATED'))
    const pool = submitted.length > 0 ? submitted : jobs
    return pool.reduce((a, b) => (b.id > a.id ? b : a))
}

// Dropping stale decisions makes the pill and displayStatus follow the live codeDecision, never
// a prior round's (OTTER-641).
export const isStaleCodeDecision = (status: StudyJobStatus, liveDecision: CodeDecisionStatus | null): boolean =>
    CODE_DECISION_JOB_STATUSES.includes(status as CodeDecisionStatus) && status !== liveDecision

export function projectStudyState(raw: RawStudyState): StudyState {
    const job = latestJob(raw.jobs)
    const jobStatuses = new Set<StudyJobStatus>(job?.statusChanges.map((c) => c.status) ?? [])

    const hasLiveDecision = latestSubmittedJobHasLiveCodeDecision(job?.statusChanges ?? [])
    const codeDecision = hasLiveDecision ? (CODE_DECISION_PRIORITY.find((d) => jobStatuses.has(d)) ?? null) : null
    const hasSubmittedCode = jobStatuses.has('CODE-SUBMITTED')
    const codeAwaitingDecision = hasSubmittedCode && codeDecision === null
    const hasResults = has(job, STUDY_RESULTS_JOB_STATUSES)
    const resultsApproved = jobStatuses.has('FILES-APPROVED')
    const resultsRejected = jobStatuses.has('FILES-REJECTED')
    const resultsErrored = jobStatuses.has('JOB-ERRORED')
    const resultsDisplayStatus = RESULTS_PRIORITY.find((r) => r && jobStatuses.has(r)) ?? null

    // Status changes are append-only, so a finished job keeps its JOB-RUNNING row; gating on
    // results stops isExecuting meaning "ever ran".
    const erroredAwaitingDecision = awaitingFilesDecisionOnError({
        resultsErrored,
        resultsApproved,
        resultsRejected,
    })
    const isExecuting = has(job, STUDY_CODE_RUNNING_JOB_STATUSES) && (!hasResults || erroredAwaitingDecision)

    // Only the live code decision passes, so DISPLAY_STATUS_PRIORITY never picks among coexisting
    // decisions.
    const visible = DISPLAY_STATUS_PRIORITY.filter(
        (st) => jobStatuses.has(st) && !isStaleCodeDecision(st, codeDecision),
    )
    const displayStatus: AllStatus = visible[0] ?? raw.status

    // Across ALL jobs. NOT the user-facing displayed version, which counts round-opening events.
    const submissionRound = raw.jobs.filter((j) => j.statusChanges.some((c) => c.status === 'CODE-SUBMITTED')).length

    // Neither persistence layer clears itself on submit, so a submitted study would otherwise
    // report Step 2 progress it can no longer resume.
    const isDraft = raw.status === 'DRAFT'

    return {
        status: raw.status,
        isDraft,
        hasStep2Progress: isDraft && (draftHasStep2Progress(raw) || raw.hasStep2CollabDoc),
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
        latestJobStatuses: [...jobStatuses].sort(),
    }
}

// Single source of truth so the reviewer table (errored triage) and researcher table (hide the
// error until decided) cannot drift (OTTER-598).
export const awaitingFilesDecisionOnError = (
    s: Pick<StudyState, 'resultsErrored' | 'resultsApproved' | 'resultsRejected'>,
): boolean => s.resultsErrored && !s.resultsApproved && !s.resultsRejected

// Shared by the rule table and the screen's render guard so the two cannot drift (OTTER-695/697).
export const isFeedbackOnlyOutcome = (s: Pick<StudyState, 'resultsRejected'>): boolean => s.resultsRejected

// The two screens CodeDecisionScreen serves, and the decision each of them displays. The rule table
// already chose between the pair, so this reads that answer back instead of re-deriving it at the
// call site, where a second derivation would be free to disagree with the page that resolved
// (OTTER-673).
//
// Execution needs no case of its own: 'outputs-pending' outranks 'code-approved' for an executing
// study, and /view/code does not consider that screen, so 'code-approved' matches on the approval
// alone. null for any other screen, so the route 404s rather than invent a decision the table never
// made.
export type CodeDecisionScreenId = Extract<ResearcherScreenId, 'code-approved' | 'code-feedback'>

export const codeDecisionForScreen = (
    screen: ScreenId,
    s: Pick<StudyState, 'codeDecision'>,
): { screen: CodeDecisionScreenId; status: CodeDecisionStatus } | null => {
    if (screen === 'code-approved') return { screen, status: 'CODE-APPROVED' }
    if (screen === 'code-feedback' && s.codeDecision !== null) return { screen, status: s.codeDecision }
    return null
}

// Narrower than resultsErrored: the scanner and containerizer also write JOB-ERRORED, so a
// packaging error before a good run leaves both that and RUN-COMPLETE on the job (OTTER-697).
export const runErrored = (statusChanges: RawJob['statusChanges']): boolean =>
    statusChanges.some((c) => c.status === 'JOB-ERRORED') && !statusChanges.some((c) => c.status === 'RUN-COMPLETE')

// Shared by the rule table and the screen's render guard so routing and rendering cannot
// disagree (OTTER-696).
export const isErroredOutputsSharedOutcome = (s: Pick<StudyState, 'resultsErrored' | 'resultsApproved'>): boolean =>
    s.resultsErrored && s.resultsApproved

// OTTER-688: a clean run whose outputs the reviewer shared along with their feedback (FILES-APPROVED
// without JOB-ERRORED). Same contract as the two predicates above: the researcher rule table and the
// screen's render guard both read it, so routing and rendering cannot disagree.
//
// Both negative clauses keep this DISJOINT from its siblings, so no rule's position in the table
// decides a screen. !resultsErrored yields the errored share to isErroredOutputsSharedOutcome, whose
// page explains a failed run. !resultsRejected matters for a job carrying BOTH FILES-* rows —
// unreachable via submitOutputsDecisionAction, which refuses a second decision, but writable by the
// QA status route and the legacy approve/reject actions. There the pill reads Rejected
// (DISPLAY_STATUS_PRIORITY ranks FILES-REJECTED first), so advertising outputs would contradict it;
// the conservative feedback-only page keeps that state instead.
export const isOutputsSharedOutcome = (
    s: Pick<StudyState, 'resultsApproved' | 'resultsRejected' | 'resultsErrored'>,
): boolean => s.resultsApproved && !s.resultsRejected && !s.resultsErrored
