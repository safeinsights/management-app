import { resolvePillPresentation, type PillContext, type PillId, type StatusLabel } from '@/lib/status-labels'
import { RESEARCHER_PILL_RULES } from './researcher-pill-rules'
import { REVIEWER_PILL_RULES } from './reviewer-pill-rules'
import { firstMatch, type RuleEntry } from './screen-rules'
import type { StudyRole, StudyState } from './state.types'

export type PillRuleEntry = RuleEntry<PillId>

const RULES: Record<StudyRole, ReadonlyArray<PillRuleEntry>> = {
    researcher: RESEARCHER_PILL_RULES,
    reviewer: REVIEWER_PILL_RULES,
}

export type PillOrgNames = Omit<PillContext, 'role'>

export function resolvePillId(role: StudyRole, state: StudyState): PillId {
    return firstMatch(RULES[role], state)
}

export function resolvePillStatus(role: StudyRole, state: StudyState, names: PillOrgNames): StatusLabel {
    return resolvePillPresentation(resolvePillId(role, state), { role, ...names })
}

export function resolveRowHighlight(role: StudyRole, state: StudyState): boolean {
    if (role === 'researcher') return state.resultsApproved && !state.resultsViewed
    return state.status === 'PENDING-REVIEW' || state.codeAwaitingDecision
}
