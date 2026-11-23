// A frozen copy of projectStudyState and latestJob from before OTTER-973 (main at 26192c88a). The job
// state parity test compares the live projection with it, so do not edit it to follow later changes:
// list an intended difference in that test instead.
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'
import {
    furthestStage,
    latestSubmittedJobHasLiveCodeDecision,
    STUDY_CODE_RUNNING_JOB_STATUSES,
    STUDY_RESULTS_JOB_STATUSES,
} from '@/lib/study-job-status'
import { draftHasStep2Progress } from '@/lib/studies'

type LegacyRawJob = { id: string; statusChanges: ReadonlyArray<{ status: StudyJobStatus }> }

type LegacyRawStudyState = Parameters<typeof draftHasStep2Progress>[0] & {
    status: StudyStatus
    researcherAgreementsAckedAt: Date | null
    reviewerAgreementsAckedAt: Date | null
    proposalResubmissionNoteDraft: string | null
    codeResubmissionNoteDraft: string | null
    hasStep2CollabDoc: boolean
    jobs: ReadonlyArray<LegacyRawJob>
}

const has = (job: LegacyRawJob | undefined, statuses: readonly StudyJobStatus[]): boolean =>
    !!job && job.statusChanges.some((c) => statuses.includes(c.status))

const RESULTS_PRIORITY = ['FILES-APPROVED', 'FILES-REJECTED', 'JOB-ERRORED', 'RUN-COMPLETE'] as const

const CODE_DECISION_PRIORITY: CodeDecisionStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'CODE-CHANGES-REQUESTED']

export function legacyLatestJob<J extends LegacyRawJob>(jobs: ReadonlyArray<J>): J | undefined {
    if (jobs.length === 0) return undefined
    const submitted = jobs.filter((j) => j.statusChanges.some((c) => c.status !== 'INITIATED'))
    const pool = submitted.length > 0 ? submitted : jobs
    return pool.reduce((a, b) => (b.id > a.id ? b : a))
}

export function legacyProjectStudyState(raw: LegacyRawStudyState) {
    const job = legacyLatestJob(raw.jobs)
    const jobStatuses = new Set<StudyJobStatus>(job?.statusChanges.map((c) => c.status) ?? [])

    const hasLiveDecision = latestSubmittedJobHasLiveCodeDecision(job?.statusChanges ?? [])
    const codeDecision = hasLiveDecision ? (CODE_DECISION_PRIORITY.find((d) => jobStatuses.has(d)) ?? null) : null
    const hasSubmittedCode = jobStatuses.has('CODE-SUBMITTED')
    const codeAwaitingDecision = hasSubmittedCode && codeDecision === null
    const hasResults = has(job, STUDY_RESULTS_JOB_STATUSES)
    const resultsApproved = jobStatuses.has('FILES-APPROVED')
    const resultsRejected = jobStatuses.has('FILES-REJECTED')
    const resultsErrored = jobStatuses.has('JOB-ERRORED')
    const runErrored = resultsErrored && !jobStatuses.has('RUN-COMPLETE')
    const resultsDisplayStatus = RESULTS_PRIORITY.find((r) => jobStatuses.has(r)) ?? null
    const erroredAwaitingDecision = resultsErrored && !resultsApproved && !resultsRejected
    const isExecuting = has(job, STUDY_CODE_RUNNING_JOB_STATUSES) && (!hasResults || erroredAwaitingDecision)
    const executionStage = furthestStage(jobStatuses)
    const submissionRound = raw.jobs.filter((j) => j.statusChanges.some((c) => c.status === 'CODE-SUBMITTED')).length
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
        runErrored,
        resultsDisplayStatus,
        resultsViewed: jobStatuses.has('RESULTS-VIEWED'),
        executionStage,
        submissionRound,
        hasSavedEdits: !!raw.proposalResubmissionNoteDraft,
        hasSavedCodeEdits: !!raw.codeResubmissionNoteDraft,
    }
}
