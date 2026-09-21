import type { PillRuleEntry } from './pill-rules'
import { awaitingFilesDecisionOnError, isAwaitingOutputsReviewOutcome, isOutputsDecided } from './state'

// Reviewer pill rules. Order = display precedence. First match wins. The live contract is the
// reviewer table in docs/study-screens-logic.md.

export const REVIEWER_PILL_RULES = [
    // A failed run the reviewer still has to triage and share feedback on.
    ['code-errored', { when: awaitingFilesDecisionOnError }],
    ['outputs-need-review', { when: isAwaitingOutputsReviewOutcome }],
    // The reviewer has submitted their decision, on a clean run or an errored one, so nothing is owed.
    ['outputs-reviewed', { when: isOutputsDecided }],

    // Enclave stages. Every job with results is claimed above, so these see only a live run.
    // JOB-PROVISIONING shares "Code queued" with JOB-READY: the design names no state between the
    // enclave accepting the job and it starting to run.
    ['code-running', { when: (s) => s.executionStage === 'JOB-RUNNING' }],
    ['code-queued', { when: (s) => s.executionStage === 'JOB-READY' || s.executionStage === 'JOB-PROVISIONING' }],
    ['code-preparing', { when: (s) => s.executionStage === 'JOB-PACKAGING' }],

    ['code-approved', { when: (s) => s.codeDecision === 'CODE-APPROVED' }],
    ['code-declined', { when: (s) => s.codeDecision === 'CODE-REJECTED' }],
    ['code-revision-requested', { when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED' }],
    ['code-needs-review', { when: (s) => s.codeAwaitingDecision }],
    // The proposal is approved and a job exists, but no code has arrived yet.
    ['code-awaiting', { when: (s) => s.status === 'APPROVED' && s.hasAnyJob && !s.hasSubmittedCode }],

    ['proposal-approved', { when: (s) => s.status === 'APPROVED' }],
    ['proposal-declined', { when: (s) => s.status === 'REJECTED' }],
    ['proposal-revision-requested', { when: (s) => s.status === 'CHANGE-REQUESTED' }],
    ['proposal-needs-review', { when: (s) => s.status === 'PENDING-REVIEW' }],

    // Exhaustive fallback, neutral rather than a call to action. A reviewer never sees a DRAFT study
    // (the dashboard queries exclude it), so only ARCHIVED, which has no badge in the design, lands here.
    ['proposal-draft', { when: () => true }],
] as const satisfies ReadonlyArray<PillRuleEntry>
