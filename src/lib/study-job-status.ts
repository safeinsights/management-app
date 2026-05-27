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
