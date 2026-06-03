import type { StudyJobStatus } from '@/database/types'

// OTTER-538: job statuses for the Study Details page. Covers "results need review"
// (RUN-COMPLETE), "results ready" (FILES-APPROVED), "results rejected" (FILES-REJECTED),
// and the errored variant (JOB-ERRORED). Shared by both the DO review page, the RL view
// page, and the StudyResults panel so the three never drift.
export const STUDY_RESULTS_JOB_STATUSES: readonly StudyJobStatus[] = [
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
]

export const isStudyResultsStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && STUDY_RESULTS_JOB_STATUSES.includes(status)

// Job statuses that mean a code-review decision has been recorded. Used to gate the
// post-decision views: the researcher's study view (OTTER on code-post-decision-view) and
// the DO's reviewer page (OTTER-552), so a study opened with a decision lands on the
// post-feedback page rather than the active code-review/decision page.
export type CodeDecisionStatus = 'CODE-APPROVED' | 'CODE-CHANGES-REQUESTED' | 'CODE-REJECTED'

export const CODE_DECISION_JOB_STATUSES: readonly CodeDecisionStatus[] = [
    'CODE-APPROVED',
    'CODE-CHANGES-REQUESTED',
    'CODE-REJECTED',
]

export const isCodeDecisionStatus = (status: StudyJobStatus | undefined): status is CodeDecisionStatus =>
    !!status && CODE_DECISION_JOB_STATUSES.includes(status as CodeDecisionStatus)
