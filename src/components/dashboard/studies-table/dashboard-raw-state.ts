import {
    projectStudyState,
    resolvePillId,
    type RawStudyState,
    type StudyRole,
    type StudyState,
} from '@/lib/study-screen'
import type { PillId } from '@/lib/status-labels'
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

type TimedChange = StudyRow['jobStatusChanges'][number]

const badgeAfter = (study: StudyRow, changes: TimedChange[], audience: StudyRole): PillId =>
    resolvePillId(audience, projectStudyState(dashboardRawStateFromRow({ ...study, jobStatusChanges: changes })))

// When the viewer's badge last changed, found by replaying the latest job's history through the
// badge rules, so each role's Last updated moves exactly when what it sees moves (OTTER-617).
// Rows written in one transaction share a timestamp and their ids are not ordered, so a shared
// timestamp is one step.
export function lastBadgeChangeAt(study: StudyRow, audience: StudyRole): Date | null {
    const timed = study.jobStatusChanges.map((change) => ({
        change,
        at: change.createdAt ? new Date(change.createdAt).getTime() : NaN,
    }))
    if (timed.length === 0 || timed.some(({ at }) => Number.isNaN(at))) return null

    const steps = [...new Set(timed.map(({ at }) => at))].sort((a, b) => a - b)
    let previous = badgeAfter(study, [], audience)
    let changedAt: number | null = null
    for (const step of steps) {
        const badge = badgeAfter(
            study,
            timed.filter(({ at }) => at <= step).map(({ change }) => change),
            audience,
        )
        if (badge !== previous) changedAt = step
        previous = badge
    }
    return changedAt === null ? null : new Date(changedAt)
}
