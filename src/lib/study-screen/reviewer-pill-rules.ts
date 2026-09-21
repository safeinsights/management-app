import type { PillRuleEntry } from './pill-rules'
import { isAwaitingOutputsReviewOutcome } from './state'

// Reviewer pill rules. Order = display precedence. First match wins. The live contract is the
// reviewer table in docs/study-screens-logic.md.

export const REVIEWER_PILL_RULES = [
    // The reviewer has submitted their decision, on a clean run or an errored one, so nothing is
    // owed. Ahead of code-errored, which is the pre-decision state of the same job.
    ['outputs-reviewed', { when: (s) => s.resultsApproved || s.resultsRejected }],
    // A failed run the reviewer still has to triage and share feedback on.
    ['code-errored', { when: (s) => s.resultsErrored }],
    ['outputs-need-review', { when: isAwaitingOutputsReviewOutcome }],

    // Enclave stages, furthest reached first. Gated on isExecuting so a finished job does not fall
    // back into them: the status log is append-only and keeps every stage it passed through.
    ['code-running', { when: (s) => s.isExecuting && s.latestJobStatuses.includes('JOB-RUNNING') }],
    // JOB-PROVISIONING shares "Code queued" with JOB-READY: the design names no state between the
    // enclave accepting the job and it starting to run.
    [
        'code-queued',
        {
            when: (s) =>
                s.isExecuting &&
                (s.latestJobStatuses.includes('JOB-PROVISIONING') || s.latestJobStatuses.includes('JOB-READY')),
        },
    ],
    ['code-preparing', { when: (s) => s.isExecuting && s.latestJobStatuses.includes('JOB-PACKAGING') }],

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

    // Exhaustive fallback. A reviewer never sees a DRAFT study (permissions.ts keeps it out of their
    // dashboard), so this is only reached by ARCHIVED, which has no badge in the design.
    ['proposal-needs-review', { when: () => true }],
] as const satisfies ReadonlyArray<PillRuleEntry>
