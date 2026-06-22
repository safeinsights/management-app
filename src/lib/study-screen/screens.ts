import type { Route } from 'next'

export type ScreenId =
    | 'proposal-edit'
    | 'proposal-submitted'
    | 'proposal-feedback'
    | 'agreements'
    | 'code-upload'
    | 'code-under-review'
    | 'code-approved'
    | 'code-feedback'
    | 'code-edit'
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
