import type { ScreenRuleEntry } from './screen-rules'
import type { ScreenId } from './screens'
import type { ViewStep } from './view-steps'

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins. Each entry
// pairs the screen it routes to with the condition that selects it; the leaf view owns its own
// back/forward buttons.
export const RESEARCHER_SCREEN_RULES = [
    // Results have landed: results-only Study Details.
    ['study-results', { when: (s) => s.hasResults }],

    // Code approved (or actively running): the approved/executing code screen.
    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting }],
    // Code rejected or changes requested: read-only code feedback.
    [
        'code-feedback',
        { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED' || s.codeDecision === 'CODE-REJECTED' },
    ],

    // Code submitted, awaiting a reviewer decision.
    ['code-under-review', { when: (s) => s.codeAwaitingDecision }],

    // Proposal approved but no code submitted yet: read-only proposal feedback.
    ['proposal-feedback', { when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode }],

    // Proposal under review: generic overview.
    ['study-overview', { when: (s) => s.status === 'PENDING-REVIEW' }],
    // Decided proposal (read-only): CHANGE-REQUESTED, REJECTED, or APPROVED-with-code (the latter
    // only reachable via ?step=proposal; the no-code APPROVED case is handled by the rule above).
    [
        'proposal-feedback',
        { when: (s) => s.status === 'CHANGE-REQUESTED' || s.status === 'REJECTED' || s.status === 'APPROVED' },
    ],

    // Draft: generic overview (editing lives on /edit).
    ['study-overview', { when: (s) => s.isDraft }],

    // Exhaustive fallback.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>

// Where each researcher screen sits in the read-only view step sequence. Reviewer screens never
// appear in this table, so they are intentionally absent (treated as rank 0 by the resolver).
const RESEARCHER_SCREEN_STEP_RANK: Partial<Record<ScreenId, number>> = {
    'study-overview': 0,
    'proposal-feedback': 1,
    'code-under-review': 2,
    'code-approved': 2,
    'code-feedback': 2,
    'study-results': 3,
}

// The rank ceiling each view step caps the rule table at (see resolveScreen).
export const VIEW_STEP_CAP: Record<ViewStep, number> = { proposal: 1, code: 2, results: 3 }

export const researcherScreenRank = (screen: ScreenId): number => RESEARCHER_SCREEN_STEP_RANK[screen] ?? 0
