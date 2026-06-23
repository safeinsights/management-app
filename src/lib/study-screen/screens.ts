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
// centralizing). `step` is harmless breadcrumb metadata.
export type ScreenDescriptor = {
    screen: ScreenId
    step?: string
}

export type DashboardAction = {
    label: string
    href: Route
    secondaryAction?: 'delete-draft'
}
