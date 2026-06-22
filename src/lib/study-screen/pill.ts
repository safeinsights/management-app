import type { StudyJobStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'
import { CODE_DECISION_JOB_STATUSES, type CodeDecisionStatus } from '@/lib/study-job-status'
import type { StudyRole, StudyState } from './state.types'
import { DISPLAY_STATUS_PRIORITY } from './state'

const LABELS: Record<StudyRole, Partial<Record<StudyJobStatus | string, StatusLabel>>> = {
    researcher: RESEARCHER_STATUS_LABELS,
    reviewer: REVIEWER_STATUS_LABELS,
}

// Faithful port of useStudyStatus's pill selection. Walk the latest job's status SET by fixed
// priority, returning the first status THE ROLE HAS A LABEL FOR — so researchers (who have no
// execution sub-status labels) fall through JOB-PACKAGING/READY/RUNNING to CODE-APPROVED, exactly
// as today, while reviewers show the granular execution label. Role-specific rules layered on top:
//  - researcher hides JOB-ERRORED until a reviewer records a FILES-* decision;
//  - on a resubmission (codeAwaitingDecision), stale code-decision statuses are dropped so the
//    fresh CODE-SUBMITTED drives the pill, not the prior round's decision.
export function resolvePillStatus(role: StudyRole, state: StudyState): StatusLabel {
    const labels = LABELS[role]
    const present = new Set<StudyJobStatus>(state.latestJobStatuses)

    const hideErrored = role === 'researcher' && !state.resultsApproved && !state.resultsRejected
    const dropStaleDecisions = state.codeAwaitingDecision

    const candidate = DISPLAY_STATUS_PRIORITY.find((st) => {
        if (!present.has(st)) return false
        if (hideErrored && st === 'JOB-ERRORED') return false
        if (dropStaleDecisions && CODE_DECISION_JOB_STATUSES.includes(st as CodeDecisionStatus)) return false
        return labels[st] !== undefined // only statuses THIS ROLE can label
    })

    // Fall back to the study status label, then DRAFT, mirroring useStudyStatus's final fallback.
    return (candidate && labels[candidate]) ?? labels[state.status] ?? labels['DRAFT']!
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
