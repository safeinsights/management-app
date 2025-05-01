type ObjectWithRole = {
    isResearcher: boolean
    isAdmin: boolean
    isReviewer: boolean
}

export const ROLE_LABELS = ['Multiple', 'Researcher', 'Reviewer'] as const

export type RoleLabel = (typeof ROLE_LABELS)[number]

export const roleLabelForUser = (user: ObjectWithRole): RoleLabel | null => {
    if (user.isAdmin || (user.isResearcher && user.isReviewer)) return 'Multiple'
    if (user.isResearcher) return 'Researcher'
    if (user.isReviewer) return 'Reviewer'
    return null
}

export const PERMISSION_LABELS = ['Contributor', 'Administrator'] as const

export type PermissionLabel = (typeof PERMISSION_LABELS)[number]

export const permissionLabelForUser = (user: ObjectWithRole): PermissionLabel | null => {
    if (user.isAdmin) return 'Administrator'
    return 'Contributor'
}
