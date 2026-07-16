import type { Json, StudyJobStatus, StudyStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type StudyRole = 'researcher' | 'reviewer'

// Raw rows as fetched. statusChanges/jobs order is NOT significant — the projection
// selects the latest job by max(id) and treats each job's statuses as a set.
export type RawJob = {
    id: string
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>
}

// Step 2 of the proposal wizard is the first time any of these columns is written (Step 1 saves only
// data partner + language + title + piName + doc paths). Any one being non-empty means the draft reached
// Step 2 — see draftHasStep2Progress / projectStudyState's hasStep2Progress.
export type DraftStep2Fields = {
    piUserId: string | null
    datasets: string[] | null
    researchQuestions: Json | null
    projectSummary: Json | null
    impact: Json | null
    additionalNotes: Json | null
}

export type RawStudyState = {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
    researcherAgreementsAckedAt: Date | null
    reviewerAgreementsAckedAt: Date | null
    proposalResubmissionNoteDraft: string | null
    codeResubmissionNoteDraft: string | null
    // OTTER-636: stamped when a real edit is made to a change-requested proposal; drives the
    // researcher's "Proposal draft" display without flipping study.status.
    proposalEditedAt: Date | null
    jobs: ReadonlyArray<RawJob>
} & DraftStep2Fields

// Flat, already-disambiguated facts. Every field is a plain boolean/enum/number.
// Job-phase facts describe the LATEST job only (max id); submissionRound is the one cross-job count.
export type StudyState = {
    status: StudyStatus
    isDraft: boolean
    // OTTER-636: a change-requested proposal the researcher has started revising. Display-only —
    // study.status stays CHANGE-REQUESTED; only the researcher's pill reads "Proposal draft".
    proposalDraftInProgress: boolean
    // A DRAFT that has reached Step 2 of the proposal wizard. Routes a "resume draft" entry to the
    // step the researcher last left off (OTTER-572) instead of always landing on the Step 1 picker.
    hasStep2Progress: boolean
    researcherAgreementsAcked: boolean
    reviewerAgreementsAcked: boolean
    hasAnyJob: boolean
    hasSubmittedCode: boolean
    codeDecision: CodeDecisionStatus | null
    codeAwaitingDecision: boolean
    isExecuting: boolean
    hasResults: boolean
    resultsApproved: boolean
    resultsRejected: boolean
    resultsErrored: boolean
    resultsDisplayStatus: 'RUN-COMPLETE' | 'FILES-APPROVED' | 'FILES-REJECTED' | 'JOB-ERRORED' | null
    submissionRound: number
    hasSavedEdits: boolean
    hasSavedCodeEdits: boolean
    displayStatus: AllStatus
    // Raw status set of the LATEST job (max id), for resolvers that need to walk statuses
    // role-aware (e.g. the pill, which only labels statuses its role defines). Set, not ordered.
    latestJobStatuses: StudyJobStatus[]
}

// Dashboard tier may read everything EXCEPT the two facts its query doesn't fetch.
export type DashboardState = Omit<StudyState, 'submissionRound' | 'hasSavedEdits' | 'hasSavedCodeEdits'>
