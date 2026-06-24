import type { RawStudyState } from '@/lib/study-screen'
import type { StudyRow } from './types'

// The dashboard row carries only the LATEST job's statuses (study.actions.ts builds a
// latestStudyJob CTE = the absolute-latest job). Synthesize a single-job RawStudyState; the
// projection's latest-job selection trivially returns that one job. Draft-note columns aren't on
// the row, so the hasSavedEdits* facts are null here — DashboardState excludes them, so they're
// never read.
//
// Intentional vs /view: /view projects from the latest *submitted* job, so after a round closes
// (FILES-APPROVED/REJECTED) and the researcher re-launches the IDE — opening a new INITIATED-only
// job — the dashboard reflects the CURRENT round ("new submission in progress") and its link sends
// them to the upload page, while /view still shows the prior round's results. This divergence is by
// design (the dashboard tracks the latest round); do NOT "fix" it to mirror /view's submitted-job
// preference. The documented invariant is route consistency, which holds: the link routes to /code.
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
        jobs: hasActivity
            ? [{ id: '0', statusChanges: study.jobStatusChanges.map((c) => ({ status: c.status })) }]
            : [],
    }
}
