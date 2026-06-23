import type { ScreenRule } from './screen-rules'

// Reviewer ("Data Partners" / DO) Tier-2 rules. Order = display precedence. First match wins.
// Every `when` reads only StudyState, so the table is order-independent by construction.
// Transcribes the legacy review/page.tsx cascade with the ?from= cases removed (those are routing,
// not screen-selection). See docs/plans/2026-06-23-reviewer-screen-state-machine-design.md §4.
export const REVIEWER_SCREEN_RULES: ScreenRule[] = [
    // 1. Results exist → results-only Study Details (OTTER-538). Out-ranks the code decision
    //    (CODE-APPROVED is always present once results land), mirroring legacy
    //    `decisionMade = hasLiveCodeDecision && !hasResultsStatus`.
    { when: (s) => s.hasResults, screen: () => ({ screen: 'reviewer-study-results' }) },

    // 2. A live code decision was recorded → read-only code post-feedback (OTTER-552). The leaf
    //    branches internally on codeDecision (approved / rejected / changes-requested).
    { when: (s) => s.codeDecision !== null, screen: () => ({ screen: 'reviewer-code-feedback' }) },

    // 3. Code submitted, awaiting a decision, agreements NOT acked → the gate screen. Above
    //    code-review: the reviewer must ack before the active review page renders.
    {
        when: (s) => s.codeAwaitingDecision && !s.reviewerAgreementsAcked,
        screen: () => ({ screen: 'reviewer-agreements' }),
    },

    // 4. Code submitted, awaiting a decision, agreements acked → active code review.
    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'reviewer-code-review' }) },

    // 5. Proposal decided but no code yet → read-only proposal feedback.
    {
        when: (s) =>
            !s.hasSubmittedCode &&
            (s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'CHANGE-REQUESTED'),
        screen: () => ({ screen: 'reviewer-proposal-feedback' }),
    },

    // 6. Proposal under review → editable proposal review.
    { when: (s) => s.status === 'PENDING-REVIEW', screen: () => ({ screen: 'reviewer-proposal-review' }) },

    // 7. Exhaustive fallback. DRAFT shouldn't reach a reviewer (the page's not-found guard handles
    //    it), but the table stays total; study-overview is a safe read-only render.
    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
