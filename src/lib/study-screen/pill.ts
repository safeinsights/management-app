import type { StudyJobStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'
import type { StudyRole, StudyState } from './state.types'
import { DISPLAY_STATUS_PRIORITY, isErroredResultHiddenFromResearcher, isStaleCodeDecision } from './state'

const LABELS: Record<StudyRole, Partial<Record<StudyJobStatus | string, StatusLabel>>> = {
    researcher: RESEARCHER_STATUS_LABELS,
    reviewer: REVIEWER_STATUS_LABELS,
}

// Guaranteed-present terminal fallback. Neither label map has a DRAFT key (a reviewer never sees a
// DRAFT study; a researcher's pill is driven by job status), so without this a DRAFT/unlabeled row
// would resolve to undefined and crash the caller. Reachable only for rows current queries filter
// out, but the function must still return a StatusLabel rather than assert non-null.
const FALLBACK_LABEL: StatusLabel = { stage: 'Proposal', label: 'Draft', colors: { bg: 'grey.10', c: 'gray.9' } }

// Port of useStudyStatus's pill selection. Walk the latest job's status SET by fixed priority,
// returning the first status THE ROLE HAS A LABEL FOR, so researchers (who have no execution
// sub-status labels) fall through JOB-PACKAGING/READY/RUNNING to CODE-APPROVED, while reviewers show
// the granular execution label. Role-specific rules layered on top:
//  - researcher hides JOB-ERRORED until a reviewer records a FILES-* decision;
//  - a code-decision status is eligible only when it is the live one (isStaleCodeDecision reuses
//    state.codeDecision). This drops stale prior-round decisions AND, when no decision is live
//    (mid-resubmission, codeDecision null), every decision, so the fresh CODE-SUBMITTED drives the pill.
//    A job carrying an early CODE-CHANGES-REQUESTED plus a later CODE-APPROVED / CODE-REJECTED therefore
//    reads Approved / Rejected, not the stale earlier round.
export function resolvePillStatus(role: StudyRole, state: StudyState): StatusLabel {
    const labels = LABELS[role]
    const present = new Set<StudyJobStatus>(state.latestJobStatuses)

    const hideErrored = role === 'researcher' && isErroredResultHiddenFromResearcher(state)

    const candidate = DISPLAY_STATUS_PRIORITY.find((st) => {
        if (!present.has(st)) return false
        if (hideErrored && st === 'JOB-ERRORED') return false
        if (isStaleCodeDecision(st, state.codeDecision)) return false
        return labels[st] !== undefined // only statuses THIS ROLE can label
    })

    // Fall back to the study status label, then a guaranteed-present terminal label (mirrors
    // useStudyStatus's final fallback, but without a non-null assertion that can lie).
    return (candidate && labels[candidate]) ?? labels[state.status] ?? FALLBACK_LABEL
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
