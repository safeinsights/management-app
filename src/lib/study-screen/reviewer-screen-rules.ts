import type { ScreenRuleEntry } from './screen-rules'
import { awaitingFilesDecisionOnError } from './state'

// Reviewer ("Data Partners" / DO) Tier-2 rules. Order = display precedence. First match wins.
// Every `when` reads only StudyState, so the table is order-independent by construction.
// Transcribes the legacy review/page.tsx cascade with the ?from= cases removed (those are routing,
// not screen-selection). The live contract is the reviewer table in docs/study-screens-logic.md —
// extend from there.
export const REVIEWER_SCREEN_RULES = [
    // 1a. Job errored, no files decision yet → errored outputs view (OTTER-667). The reviewer
    //     enters their security key to decrypt error logs before making a files decision.
    ['reviewer-outputs-errored', { when: (s) => awaitingFilesDecisionOnError(s) }],

    // 1b. Run completed, no files decision yet ("results pending review") → outputs-available view
    //     (OTTER-668). The reviewer enters their security key to decrypt the outputs before making
    //     a files decision. Keyed on resultsDisplayStatus so the result-status priority stays owned
    //     by the state machine (approved/rejected/errored all out-rank RUN-COMPLETE there) instead
    //     of being re-derived here, and so routing reads the same fact the screen's own guard
    //     checks (#922 review).
    ['reviewer-outputs-available', { when: (s) => s.resultsDisplayStatus === 'RUN-COMPLETE' }],

    // 1c. Results exist and a files decision was recorded (OTTER-677) → the post-review page that
    //     surfaces the decision, feedback history, and lets the reviewer re-decrypt outputs. 1a/1b
    //     claim the undecided states above, so only decided results reach this rule. Out-ranks the
    //     code decision (CODE-APPROVED is always present once results land).
    ['reviewer-outputs-decided', { when: (s) => s.hasResults }],

    // 2. Code approved and executing in the enclave, no results yet → the "Secondary
    //    analysis study" outputs view surfacing the current job stage.
    ['reviewer-outputs-pending', { when: (s) => s.isExecuting }],

    // 3. A live code decision was recorded → read-only code post-feedback (OTTER-552). The leaf
    //    branches internally on codeDecision (approved / rejected / changes-requested).
    ['reviewer-code-feedback', { when: (s) => s.codeDecision !== null }],

    // 4. Code submitted, awaiting a decision, agreements NOT acked → the gate screen. Above
    //    code-review: the reviewer must ack before the active review page renders.
    ['reviewer-agreements', { when: (s) => s.codeAwaitingDecision && !s.reviewerAgreementsAcked }],

    // 5. Code submitted, awaiting a decision, agreements acked → active code review.
    ['reviewer-code-review', { when: (s) => s.codeAwaitingDecision }],

    // 6. Proposal decided but no code yet → read-only proposal feedback.
    [
        'reviewer-proposal-feedback',
        {
            when: (s) =>
                !s.hasSubmittedCode &&
                (s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'CHANGE-REQUESTED'),
        },
    ],

    // 7. Proposal under review → editable proposal review.
    ['reviewer-proposal-review', { when: (s) => s.status === 'PENDING-REVIEW' }],

    // 8. Exhaustive fallback. DRAFT shouldn't reach a reviewer (the page's not-found guard handles
    //    it), but the table stays total; study-overview is a safe read-only render.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>
