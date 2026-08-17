import type { Route } from 'next'

export type ScreenId =
    // researcher
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'outputs-pending'
    | 'study-results'
    | 'study-overview'
    // reviewer
    | 'reviewer-proposal-review'
    | 'reviewer-proposal-feedback'
    // Unreachable since OTTER-727 hid the Agreements step: no rule in REVIEWER_SCREEN_RULES resolves
    // to it. Kept (with its registry entry and component) so the gate can be restored by re-adding
    // the single rule entry.
    | 'reviewer-agreements'
    | 'reviewer-code-review'
    | 'reviewer-code-feedback'
    | 'reviewer-outputs-pending'
    | 'reviewer-outputs-errored'
    | 'reviewer-outputs-available'
    | 'reviewer-study-results'

// The rule table decides WHICH screen a study shows; each leaf view owns its own back/forward
// buttons (nav is simple and stable, and the screen-selection logic is the part that needed
// centralizing). The screen is derived purely from state — no URL params feed into it.
export type ScreenDescriptor = {
    screen: ScreenId
    // True for the reviewer read-only /review/code step, where navigation differs from live review.
    readOnlyCodeStep?: boolean
}

export type DashboardAction = {
    label: string
    href: Route
    secondaryAction?: 'delete-draft'
}
