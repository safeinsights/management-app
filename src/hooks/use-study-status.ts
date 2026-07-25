import type { StudyJobStatus, StudyStatus } from '@/database/types'
import type { StatusLabel } from '@/lib/status-labels'
import { projectStudyState, resolvePillStatus } from '@/lib/study-screen'

export type MinimalStatusChange = {
    status: StudyJobStatus
}

export type UseStudyStatusParams = {
    studyStatus: StudyStatus
    audience: 'reviewer' | 'researcher'
    jobStatusChanges: MinimalStatusChange[]
}

// The dashboard pill, now derived from the shared state machine. We synthesize a single-job
// RawStudyState from the row's (latest-job) statuses, project it, and resolve the label — so the
// pill, the row highlight, reviewer routing, and the study pages all read one source of truth.
export const useStudyStatus = ({ studyStatus, audience, jobStatusChanges }: UseStudyStatusParams): StatusLabel => {
    const state = projectStudyState({
        status: studyStatus,
        // The pill only needs status + jobs; fields this hook doesn't receive (agreements,
        // draft notes, dates, step-2 progress) are null and don't affect any pill fact.
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        // Not received here; a reviewer-visible DRAFT is always a revision draft and the DRAFT pill
        // label ("Proposal Draft") resolves the same either way, so null is safe for the pill.
        proposalRevisionBaseSubmissionId: null,
        piUserId: null,
        datasets: null,
        researchQuestions: null,
        projectSummary: null,
        impact: null,
        additionalNotes: null,
        jobs: jobStatusChanges.length ? [{ id: '0', statusChanges: jobStatusChanges }] : [],
    })
    return resolvePillStatus(audience, state)
}
