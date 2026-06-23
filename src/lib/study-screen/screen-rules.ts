import type { StudyState } from './state.types'
import type { ScreenId } from './screens'

export type ScreenRuleCtx = { orgSlug: string; studyId: string; returnTo?: 'org' }
export type ScreenRule = { when: (s: StudyState) => boolean }
export type ScreenRuleEntry = readonly [ScreenId, ScreenRule]

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins. Each entry
// pairs the screen it routes to with the condition that selects it; the leaf view owns its own
// back/forward buttons.
export const SCREEN_RULES = [
    ['study-results', { when: (s) => s.hasResults }],

    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting }],
    ['code-feedback', { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED' }],
    ['code-feedback', { when: (s) => s.codeDecision === 'CODE-REJECTED' }],

    ['code-under-review', { when: (s) => s.codeAwaitingDecision }],

    ['proposal-feedback', { when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode }],

    ['study-overview', { when: (s) => s.status === 'PENDING-REVIEW' }],
    ['proposal-feedback', { when: (s) => s.status === 'CHANGE-REQUESTED' }],
    // Decided proposal (read-only): REJECTED, or APPROVED that already has code (the no-code
    // APPROVED case is handled by the proposal-feedback rule above).
    ['proposal-feedback', { when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED' }],

    ['study-overview', { when: (s) => s.isDraft }],

    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>
