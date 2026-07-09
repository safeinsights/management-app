import type { Route } from 'next'

export type ScreenId =
    // researcher
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'study-results'
    | 'study-overview'
    // reviewer
    | 'reviewer-proposal-review'
    | 'reviewer-proposal-feedback'
    | 'reviewer-agreements'
    | 'reviewer-code-review'
    | 'reviewer-code-feedback'
    | 'reviewer-study-results'

// The rule table decides WHICH screen a study shows; each leaf view owns its own back/forward
// buttons (nav is simple and stable, and the screen-selection logic is the part that needed
// centralizing). The screen is derived purely from state — no URL params feed into it.
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
