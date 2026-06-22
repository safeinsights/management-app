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
        // draft notes, dates) are null and don't affect any pill fact.
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: jobStatusChanges.length ? [{ id: '0', statusChanges: jobStatusChanges, files: [] }] : [],
    })
    return resolvePillStatus(audience, state)
}
