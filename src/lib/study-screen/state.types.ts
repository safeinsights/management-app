import type { Language, StudyJobFileType, StudyJobStatus, StudyStatus } from '@/database/types'
import type { AllStatus } from '@/lib/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type StudyRole = 'researcher' | 'reviewer'

// Raw rows as fetched. statusChanges/jobs order is NOT significant — the projection
// selects the latest job by max(id) and treats each job's statuses as a set.
export type RawJob = {
    id: string
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>
    files: ReadonlyArray<{ fileType: StudyJobFileType }>
}

export type RawStudyState = {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
    researcherAgreementsAckedAt: Date | null
    reviewerAgreementsAckedAt: Date | null
    language: Language | null
    proposalResubmissionNoteDraft: string | null
    codeResubmissionNoteDraft: string | null
    jobs: ReadonlyArray<RawJob>
}

// Flat, already-disambiguated facts. Every field is a plain boolean/enum/number.
// Job-phase facts describe the LATEST job only (max id); submissionRound is the one cross-job count.
export type StudyState = {
    status: StudyStatus
    isDraft: boolean
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
}

// Dashboard tier may read everything EXCEPT the two facts its query doesn't fetch.
export type DashboardState = Omit<StudyState, 'submissionRound' | 'hasSavedEdits' | 'hasSavedCodeEdits'>
