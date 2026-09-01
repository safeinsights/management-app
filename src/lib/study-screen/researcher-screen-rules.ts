import type { ScreenRuleEntry } from './screen-rules'
import {
    awaitingFilesDecisionOnError,
    isErroredOutputsSharedOutcome,
    isFeedbackOnlyOutcome,
    isOutputsSharedOutcome,
} from './state'

// Researcher Tier-2 rules. Order = display precedence. First match wins. Each entry pairs the screen
// it routes to with the condition that selects it; the leaf view owns its own back/forward buttons.
// The live contract is the researcher table in docs/study-screens-logic.md — extend from there.

export const RESEARCHER_SCREEN_RULES = [
    // These three claim every FILES-* decision and must out-rank study-results, which would
    // otherwise take them once FILES-APPROVED clears awaitingFilesDecisionOnError. They are
    // mutually disjoint, so their order among themselves carries no meaning.
    ['outputs-errored-shared', { when: isErroredOutputsSharedOutcome }],
    ['outputs-feedback', { when: isFeedbackOnlyOutcome }],
    ['outputs-shared', { when: isOutputsSharedOutcome }],

    // A bare JOB-ERRORED is excluded until a reviewer records a FILES-* decision, so the error is
    // never disclosed before triage (OTTER-598).
    ['study-results', { when: (s) => s.hasResults && !awaitingFilesDecisionOnError(s) }],

    // Code approved and executing in the enclave: researcher outputs-pending screen (OTTER-686).
    ['outputs-pending', { when: (s) => s.codeDecision === 'CODE-APPROVED' && s.isExecuting }],
    // Code approved but not yet executing: the approved code screen.
    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' }],
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
