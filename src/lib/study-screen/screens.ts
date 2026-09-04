import type { Route } from 'next'

// Split by role so each role's nav table (see ./nav) can be a total Record and a missing screen is a
// compile error, the same guarantee SCREEN_COMPONENTS gives the screen registry. 'study-overview' is
// researcher-owned; the reviewer table reuses it only as its exhaustive fallback.
export type ResearcherScreenId =
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'outputs-pending'
    | 'outputs-feedback'
    | 'outputs-errored-shared'
    // The clean-run counterpart. Named for the reviewer's decision, not for availability:
    // 'reviewer-outputs-available' already means a completed run still awaiting one.
    | 'outputs-shared'
    | 'study-results'
    | 'study-overview'

export type ReviewerScreenId =
    | 'reviewer-proposal-review'
    | 'reviewer-proposal-feedback'
    // Unreachable since OTTER-727 hid the Agreements step; kept so the gate can be restored by
    // re-adding one rule entry.
    | 'reviewer-agreements'
    | 'reviewer-code-review'
    | 'reviewer-code-feedback'
    | 'reviewer-outputs-pending'
    | 'reviewer-outputs-errored'
    | 'reviewer-outputs-available'
    | 'reviewer-outputs-decided'

export type ScreenId = ResearcherScreenId | ReviewerScreenId

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
