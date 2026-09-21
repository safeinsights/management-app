import { resolvePillPresentation, type PillContext, type StatusLabel } from '@/lib/status-labels'
import type { PillRuleEntry } from './pill-rules'
import { RESEARCHER_PILL_RULES } from './researcher-pill-rules'
import { REVIEWER_PILL_RULES } from './reviewer-pill-rules'
import type { StudyRole, StudyState } from './state.types'

const RULES: Record<StudyRole, ReadonlyArray<PillRuleEntry>> = {
    researcher: RESEARCHER_PILL_RULES,
    reviewer: REVIEWER_PILL_RULES,
}

export type PillOrgNames = Omit<PillContext, 'role'>

// Both tables end in an unconditional rule, so find always hits and the pill can never be undefined.
export function resolvePillId(role: StudyRole, state: StudyState) {
    return RULES[role].find(([, rule]) => rule.when(state))![0]
}

export function resolvePillStatus(role: StudyRole, state: StudyState, names: PillOrgNames): StatusLabel {
    return resolvePillPresentation(resolvePillId(role, state), { role, ...names })
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
