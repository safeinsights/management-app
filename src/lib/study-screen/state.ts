import type { StudyJobStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'
import {
    CODE_DECISION_JOB_STATUSES,
    STUDY_CODE_RUNNING_JOB_STATUSES,
    STUDY_RESULTS_JOB_STATUSES,
} from '@/lib/study-job-status'
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
    return jobs.reduce((a, b) => (b.id > a.id ? b : a))
}

export function projectStudyState(raw: RawStudyState): StudyState {
    const job = latestJob(raw.jobs)
    const jobStatuses = new Set<StudyJobStatus>(job?.statusChanges.map((c) => c.status) ?? [])

    const codeDecision = CODE_DECISION_PRIORITY.find((d) => jobStatuses.has(d)) ?? null
    const hasSubmittedCode = jobStatuses.has('CODE-SUBMITTED')
    const codeAwaitingDecision = hasSubmittedCode && codeDecision === null
    const hasResults = has(job, STUDY_RESULTS_JOB_STATUSES)
    const resultsDisplayStatus = RESULTS_PRIORITY.find((r) => r && jobStatuses.has(r)) ?? null

    // displayStatus: drop stale code decisions on a resubmission (latest job submitted, no live decision),
    // then pick the highest-priority present status; fall back to study status when the job has none.
    const dropStale = hasSubmittedCode && codeDecision === null
    const visible = DISPLAY_STATUS_PRIORITY.filter(
        (st) => jobStatuses.has(st) && !(dropStale && CODE_DECISION_JOB_STATUSES.includes(st as CodeDecisionStatus)),
    )
    const displayStatus: AllStatus = visible[0] ?? raw.status

    const submissionRound = raw.jobs.filter((j) => j.statusChanges.some((c) => c.status === 'CODE-SUBMITTED')).length

    return {
        status: raw.status,
        isDraft: raw.status === 'DRAFT',
        researcherAgreementsAcked: !!raw.researcherAgreementsAckedAt,
        reviewerAgreementsAcked: !!raw.reviewerAgreementsAckedAt,
        hasAnyJob: raw.jobs.length > 0,
        hasSubmittedCode,
        codeDecision,
        codeAwaitingDecision,
        isExecuting: has(job, STUDY_CODE_RUNNING_JOB_STATUSES),
        hasResults,
        resultsApproved: jobStatuses.has('FILES-APPROVED'),
        resultsRejected: jobStatuses.has('FILES-REJECTED'),
        resultsErrored: jobStatuses.has('JOB-ERRORED'),
        resultsDisplayStatus,
        submissionRound,
        hasSavedEdits: !!raw.proposalResubmissionNoteDraft,
        hasSavedCodeEdits: !!raw.codeResubmissionNoteDraft,
        displayStatus,
        latestJobStatuses: [...jobStatuses].sort(),
    }
}
