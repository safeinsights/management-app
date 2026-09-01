import type { Route } from 'next'

export type ScreenId =
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
