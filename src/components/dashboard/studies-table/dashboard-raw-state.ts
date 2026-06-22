import type { RawStudyState } from '@/lib/study-screen'
import type { StudyRow } from './types'

// The dashboard row carries only the LATEST job's statuses (study.actions.ts builds a
// latestStudyJob CTE). Synthesize a single-job RawStudyState; the projection's latest-job
// selection trivially returns that one job. Draft-note columns aren't on the row, so the
// hasSavedEdits* facts are null here — DashboardState excludes them, so they're never read.
export function dashboardRawStateFromRow(study: StudyRow): RawStudyState {
    const hasActivity = study.jobStatusChanges.length > 0
    return {
        status: study.status,
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: study.researcherAgreementsAckedAt,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: hasActivity
            ? [{ id: '0', statusChanges: study.jobStatusChanges.map((c) => ({ status: c.status })), files: [] }]
            : [],
    }
}
