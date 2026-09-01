import type { StudyJobStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, type StatusLabel } from '@/lib/status-labels'
import type { StudyRole, StudyState } from './state.types'
import { DISPLAY_STATUS_PRIORITY, awaitingFilesDecisionOnError, isStaleCodeDecision } from './state'

const LABELS: Record<StudyRole, Partial<Record<StudyJobStatus | string, StatusLabel>>> = {
    researcher: RESEARCHER_STATUS_LABELS,
    reviewer: REVIEWER_STATUS_LABELS,
}

// Neither label map has a DRAFT key, so without this an unlabeled row resolves to undefined and
// crashes the caller.
const FALLBACK_LABEL: StatusLabel = { stage: 'Proposal', label: 'Draft', colors: { bg: 'grey.10', c: 'gray.9' } }

// Returns the first priority status THE ROLE HAS A LABEL FOR, so researchers fall through the
// execution sub-statuses to CODE-APPROVED.
export function resolvePillStatus(role: StudyRole, state: StudyState): StatusLabel {
    const labels = LABELS[role]
    const present = new Set<StudyJobStatus>(state.latestJobStatuses)

    const hideErrored = role === 'researcher' && awaitingFilesDecisionOnError(state)

    const candidate = DISPLAY_STATUS_PRIORITY.find((st) => {
        if (!present.has(st)) return false
        if (hideErrored && st === 'JOB-ERRORED') return false
        if (isStaleCodeDecision(st, state.codeDecision)) return false
        return labels[st] !== undefined
    })

    return (candidate && labels[candidate]) ?? labels[state.status] ?? FALLBACK_LABEL
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
