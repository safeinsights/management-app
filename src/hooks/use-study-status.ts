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
    // OTTER-636: present (non-null) when the researcher has started revising a change-requested
    // proposal, so the pill reads "Proposal draft". Reviewer rows pass null (display-only, researcher-only).
    proposalEditedAt?: Date | null
}

// The dashboard pill, now derived from the shared state machine. We synthesize a single-job
// RawStudyState from the row's (latest-job) statuses, project it, and resolve the label — so the
// pill, the row highlight, reviewer routing, and the study pages all read one source of truth.
export const useStudyStatus = ({
    studyStatus,
    audience,
    jobStatusChanges,
    proposalEditedAt = null,
}: UseStudyStatusParams): StatusLabel => {
    const state = projectStudyState({
        status: studyStatus,
        // The pill only needs status + jobs + proposalEditedAt; other fields this hook doesn't receive
        // (agreements, draft notes, dates, step-2 progress) are null and don't affect any pill fact.
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        proposalEditedAt,
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
