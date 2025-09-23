type ObjectWithRole = {
    isAdmin: boolean
}

export const PERMISSION_LABELS = ['Contributor', 'Administrator'] as const

export type PermissionLabel = (typeof PERMISSION_LABELS)[number]

export const permissionLabelForUser = (user: ObjectWithRole): PermissionLabel | null => {
    if (user.isAdmin) return 'Administrator'
    return 'Contributor'
}

// For display purposes - show the organization type as the role
export const roleDisplayForOrgType = (orgType: 'enclave' | 'lab'): string => {
    return orgType === 'enclave' ? 'Reviewer' : 'Researcher'
}
