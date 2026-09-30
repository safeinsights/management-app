import { projectStudyState, type RawStudyState, type StudyState } from '@/lib/study-screen'
import type { StudyRow } from './types'

// Diverging from /view's latest-*submitted*-job projection is deliberate: the dashboard tracks
// the current round. Do not "fix" it to mirror /view.
export function dashboardRawStateFromRow(study: StudyRow): RawStudyState {
    const hasActivity = study.jobStatusChanges.length > 0
    return {
        status: study.status,
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: study.researcherAgreementsAckedAt,
        reviewerAgreementsAckedAt: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        // The collaborative document covers Step 2 edits no flush wrote to the columns (OTTER-572).
        piUserId: study.piUserId,
        datasets: study.datasets,
        researchQuestions: study.researchQuestions,
        projectSummary: study.projectSummary,
        impact: study.impact,
        additionalNotes: study.additionalNotes,
        hasStep2CollabDoc: !!study.hasStep2CollabDoc,
        jobs: hasActivity
            ? [{ id: '0', statusChanges: study.jobStatusChanges.map((c) => ({ status: c.status })) }]
            : [],
    }
}

// One projection per row, so the badge, the row highlight and the action link cannot disagree about
// what the row is.
export const rowStudyState = (study: StudyRow): StudyState => projectStudyState(dashboardRawStateFromRow(study))
