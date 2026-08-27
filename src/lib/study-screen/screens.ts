import type { Route } from 'next'

// Split by role so each role's nav table (see ./nav) can be a total Record and a missing screen is a
// compile error, the same guarantee SCREEN_COMPONENTS gives the screen registry. 'study-overview' is
// researcher-owned; the reviewer table reuses it only as its exhaustive fallback.
export type ResearcherScreenId =
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'study-results'
    | 'study-overview'

export type ReviewerScreenId =
    | 'reviewer-proposal-review'
    | 'reviewer-proposal-feedback'
    | 'reviewer-agreements'
    | 'reviewer-code-review'
    | 'reviewer-code-feedback'
    | 'reviewer-study-results'

export type ScreenId = ResearcherScreenId | ReviewerScreenId

// The rule table decides WHICH screen a study shows; ./nav decides which back/forward buttons that
// screen carries (OTTER-673 standardised in-content nav, so it is no longer per-view). Both are
// derived purely from state — no URL params feed into either.
export type ScreenDescriptor = {
    screen: ScreenId
    // True only for the read-only /view/code step (resolveResearcherCodeScreen). The code screen reads
    // this to keep the submitted code visible even while the job runs in the enclave (OTTER-640): the
    // execution-window hide is the live /view flow's behavior, not the read-only step the researcher
    // walks back to. The live resolver never sets it, so the live flow is unchanged.
    readOnlyCodeStep?: boolean
}

export type DashboardAction = {
    label: string
    href: Route
    secondaryAction?: 'delete-draft'
}
