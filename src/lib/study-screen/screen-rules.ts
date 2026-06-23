import type { StudyState } from './state.types'
import type { ScreenDescriptor } from './screens'

export type ScreenRuleCtx = { orgSlug: string; studyId: string; returnTo?: 'org' }
export type ScreenRule = {
    when: (s: StudyState) => boolean
    screen: (s: StudyState, ctx: ScreenRuleCtx) => ScreenDescriptor
}

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins. Each rule
// resolves only WHICH screen renders; the leaf view owns its own back/forward buttons.
export const SCREEN_RULES: ScreenRule[] = [
    { when: (s) => s.hasResults, screen: () => ({ screen: 'study-results' }) },

    { when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting, screen: () => ({ screen: 'code-approved' }) },
    { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED', screen: () => ({ screen: 'code-feedback' }) },
    { when: (s) => s.codeDecision === 'CODE-REJECTED', screen: () => ({ screen: 'code-feedback' }) },

    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'code-under-review' }) },

    { when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode, screen: () => ({ screen: 'proposal-feedback' }) },

    { when: (s) => s.status === 'PENDING-REVIEW', screen: () => ({ screen: 'study-overview' }) },
    { when: (s) => s.status === 'CHANGE-REQUESTED', screen: () => ({ screen: 'proposal-feedback' }) },
    // Decided proposal (read-only): REJECTED, or APPROVED that already has code (the no-code
    // APPROVED case is handled by the proposal-feedback rule above).
    {
        when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED',
        screen: () => ({ screen: 'proposal-feedback' }),
    },

    { when: (s) => s.isDraft, screen: () => ({ screen: 'study-overview' }) },

    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
