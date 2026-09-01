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

// Derived from the shared state machine so the pill, row highlight, reviewer routing, and study
// pages all read one source of truth.
export const useStudyStatus = ({ studyStatus, audience, jobStatusChanges }: UseStudyStatusParams): StatusLabel => {
    const state = projectStudyState({
        status: studyStatus,
        // The pill only needs status + jobs; the fields this hook does not receive affect no pill
        // fact, so they are null.
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
        jobs: jobStatusChanges.length ? [{ id: '0', statusChanges: jobStatusChanges }] : [],
    })
    return resolvePillStatus(audience, state)
}
