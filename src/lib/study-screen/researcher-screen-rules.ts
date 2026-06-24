import type { ScreenRuleEntry } from './screen-rules'

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

    // Proposal approved but no code submitted yet: read-only proposal feedback (next step is code).
    ['proposal-feedback', { when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode }],

    // Proposal under review: generic overview.
    ['study-overview', { when: (s) => s.status === 'PENDING-REVIEW' }],
    // Decided proposal (read-only): CHANGE-REQUESTED, REJECTED, or APPROVED that already has code
    // (the no-code APPROVED case is handled by the proposal-feedback rule above).
    [
        'proposal-feedback',
        { when: (s) => s.status === 'CHANGE-REQUESTED' || s.status === 'REJECTED' || s.status === 'APPROVED' },
    ],

    // Draft: generic overview (editing lives on /edit).
    ['study-overview', { when: (s) => s.isDraft }],

    // Exhaustive fallback.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>
