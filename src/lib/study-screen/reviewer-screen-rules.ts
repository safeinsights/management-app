import type { ScreenRuleEntry } from './screen-rules'

// Reviewer ("Data Partners" / DO) Tier-2 rules. Order = display precedence. First match wins.
// Every `when` reads only StudyState, so the table is order-independent by construction.
// Transcribes the legacy review/page.tsx cascade with the ?from= cases removed (those are routing,
// not screen-selection). See docs/plans/2026-06-23-reviewer-screen-state-machine-design.md §4.
export const REVIEWER_SCREEN_RULES = [
    // 1. Results exist → results-only Study Details (OTTER-538). Out-ranks the code decision
    //    (CODE-APPROVED is always present once results land), mirroring legacy
    //    `decisionMade = hasLiveCodeDecision && !hasResultsStatus`.
    ['reviewer-study-results', { when: (s) => s.hasResults }],

    // 2. A live code decision was recorded → read-only code post-feedback (OTTER-552). The leaf
    //    branches internally on codeDecision (approved / rejected / changes-requested).
    ['reviewer-code-feedback', { when: (s) => s.codeDecision !== null }],

    // 3. Code submitted, awaiting a decision, agreements NOT acked → the gate screen. Above
    //    code-review: the reviewer must ack before the active review page renders.
    ['reviewer-agreements', { when: (s) => s.codeAwaitingDecision && !s.reviewerAgreementsAcked }],

    // 4. Code submitted, awaiting a decision, agreements acked → active code review.
    ['reviewer-code-review', { when: (s) => s.codeAwaitingDecision }],

    // 5. Proposal decided but no code yet → read-only proposal feedback. OTTER-636: a revision draft
    //    (a change-requested proposal the researcher is now editing) routes here too — the reviewer
    //    sees the last submitted snapshot + prior feedback, read-only, with no actionable decision.
    [
        'reviewer-proposal-feedback',
        {
            when: (s) =>
                !s.hasSubmittedCode &&
                (s.status === 'APPROVED' ||
                    s.status === 'REJECTED' ||
                    s.status === 'CHANGE-REQUESTED' ||
                    s.isProposalRevisionDraft),
        },
    ],

    // 6. Proposal under review → editable proposal review.
    ['reviewer-proposal-review', { when: (s) => s.status === 'PENDING-REVIEW' }],

    // 7. Exhaustive fallback. A FRESH DRAFT shouldn't reach a reviewer (the page's not-found guard
    //    handles it), but the table stays total; study-overview is a safe read-only render.
    ['study-overview', { when: () => true }],
] as const satisfies ReadonlyArray<ScreenRuleEntry>
