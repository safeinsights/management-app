import type { PillRuleEntry } from './pill-rules'
import { awaitingFilesDecisionOnError, isAwaitingOutputsReviewOutcome, isOutputsDecided } from './state'

// Researcher pill rules. Order = display precedence. First match wins. The live contract is the
// researcher table in docs/study-screens-logic.md.

export const RESEARCHER_PILL_RULES = [
    // A failed run stays a failed run once the reviewer releases it: the researcher's next move is to
    // read the feedback and resubmit, not to collect outputs. Ahead of the two outputs rows so an
    // errored job never advertises results.
    ['code-errored', { when: (s) => s.resultsErrored && isOutputsDecided(s) }],

    // A released decision the researcher has already opened, then one they have not. The view is the
    // one fact the lifecycle statuses cannot carry, so RESULTS-VIEWED records it (OTTER-698).
    ['outputs-reviewed', { when: (s) => isOutputsDecided(s) && s.resultsViewed }],
    ['outputs-need-review', { when: isOutputsDecided }],

    // Waiting on the reviewer. awaitingFilesDecisionOnError keeps a bare JOB-ERRORED here rather than
    // disclosing the failure before triage (OTTER-598).
    ['outputs-awaiting', { when: (s) => isAwaitingOutputsReviewOutcome(s) || awaitingFilesDecisionOnError(s) }],

    // One label for the whole enclave run: the researcher sees no packaging/queued/running detail.
    ['code-processing', { when: (s) => s.isExecuting }],

    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' }],
    // Terminal, unlike a revision request: canResearcherResubmitCode excludes it.
    ['code-declined', { when: (s) => s.codeDecision === 'CODE-REJECTED' }],
    ['code-needs-revision', { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED' }],
    ['code-submitted', { when: (s) => s.codeAwaitingDecision }],
    // A job exists but nothing was submitted from it, so the code round is still a draft.
    ['code-draft', { when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode }],

    ['proposal-approved', { when: (s) => s.status === 'APPROVED' }],
    ['proposal-declined', { when: (s) => s.status === 'REJECTED' }],
    ['proposal-needs-revision', { when: (s) => s.status === 'CHANGE-REQUESTED' }],
    ['proposal-submitted', { when: (s) => s.status === 'PENDING-REVIEW' }],

    // Exhaustive fallback. DRAFT lands here, and so does ARCHIVED, which no rule claims because the
    // design has no badge for it and nothing in the app writes it.
    ['proposal-draft', { when: () => true }],
] as const satisfies ReadonlyArray<PillRuleEntry>
