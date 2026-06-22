import type { Route } from 'next'

export type ScreenId =
    | 'proposal-feedback'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'study-results'
    | 'study-overview'

export type ScreenIntent = 'submit-proposal' | 'resubmit-proposal' | 'submit-code' | 'resubmit-code'

export type ButtonDescriptor = {
    title: string
    target: { kind: 'route'; href: Route } | { kind: 'intent'; intent: ScreenIntent }
}

export type ModalDescriptor = { intent: ScreenIntent }

export type ScreenDescriptor = {
    screen: ScreenId
    step?: string
    back?: ButtonDescriptor
    forward?: ButtonDescriptor
    modal?: ModalDescriptor
}

export type DashboardAction = {
    label: string
    href: Route
    secondaryAction?: 'delete-draft'
}
