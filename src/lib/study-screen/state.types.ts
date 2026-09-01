import type { Json, StudyJobStatus, StudyStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type StudyRole = 'researcher' | 'reviewer'

// statusChanges/jobs order is NOT significant: the projection selects the latest job by max(id)
// and treats each job's statuses as a set. createdAt is display-only.
export type RawJob = {
    id: string
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt?: Date | string }>
}

// Only the whole story in single-user mode: collaborative mode autosaves into Yjs and flushes
// rarely, so hasStep2CollabDoc carries the rest of the signal.
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
    // The draft reached Step 2 even if no flush ever wrote the DraftStep2Fields columns (OTTER-572).
    hasStep2CollabDoc: boolean
    jobs: ReadonlyArray<RawJob>
} & DraftStep2Fields

// Job-phase facts describe the LATEST job only (max id); submissionRound is the one cross-job count.
export type StudyState = {
    status: StudyStatus
    isDraft: boolean
    // Draft-gated in projectStudyState, so false for every non-DRAFT status even though both
    // persistence layers keep their Step 2 traces past submission (OTTER-572).
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
    // Raw status set of the LATEST job. Set, not ordered.
    latestJobStatuses: StudyJobStatus[]
}

export type DashboardState = Omit<StudyState, 'submissionRound' | 'hasSavedEdits' | 'hasSavedCodeEdits'>
