import type { ScreenRuleEntry } from './screen-rules'
import { awaitingFilesDecisionOnError } from './state'

// Order = display precedence, first match wins. The live contract is the reviewer table in
// docs/study-screens-logic.md — extend from there.
export const REVIEWER_SCREEN_RULES = [
    ['reviewer-outputs-errored', { when: (s) => awaitingFilesDecisionOnError(s) }],

    // Keyed on resultsDisplayStatus so routing reads the same fact the screen's own guard checks.
    ['reviewer-outputs-available', { when: (s) => s.resultsDisplayStatus === 'RUN-COMPLETE' }],

    // Only decided results reach here. Out-ranks the code decision, since CODE-APPROVED is always
    // present once results land.
    ['reviewer-outputs-decided', { when: (s) => s.hasResults }],

    ['reviewer-outputs-pending', { when: (s) => s.isExecuting }],

    ['reviewer-code-feedback', { when: (s) => s.codeDecision !== null }],

    // OTTER-727 removed the `reviewer-agreements` gate above this rule, leaving that screen
    // retained but unreachable; it is superseded by SLA acknowledgements (SHRMP-273).
    ['reviewer-code-review', { when: (s) => s.codeAwaitingDecision }],

    [
        'reviewer-proposal-feedback',
        {
            when: (s) =>
                !s.hasSubmittedCode &&
                (s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'CHANGE-REQUESTED'),
        },
    ],

    ['reviewer-proposal-review', { when: (s) => s.status === 'PENDING-REVIEW' }],

    // DRAFT shouldn't reach a reviewer, but the table stays total.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>
