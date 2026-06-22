import type { AllStatus } from '@/lib/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'
import type { StudyRole, StudyState } from './state.types'

const LABELS: Record<StudyRole, Partial<Record<AllStatus, StatusLabel>>> = {
    researcher: RESEARCHER_STATUS_LABELS,
    reviewer: REVIEWER_STATUS_LABELS,
}

// Researchers must not see "Errored" until a reviewer records FILES-APPROVED/FILES-REJECTED.
// Until then the pill falls back to the prior code stage (typically CODE-APPROVED).
function effectiveDisplayStatus(role: StudyRole, state: StudyState): AllStatus {
    if (role === 'researcher' && state.resultsErrored && !state.resultsApproved && !state.resultsRejected) {
        // hide JOB-ERRORED: prefer the live code decision, else the study status
        return state.codeDecision ?? state.status
    }
    return state.displayStatus
}

export function resolvePillStatus(role: StudyRole, state: StudyState): StatusLabel {
    const key = effectiveDisplayStatus(role, state)
    const labels = LABELS[role]
    // Fall back to reviewer labels for execution sub-statuses not in researcher map,
    // then to the DRAFT label, then to the study-status label.
    return labels[key] ?? REVIEWER_STATUS_LABELS[key] ?? labels['DRAFT'] ?? labels[state.status]!
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
