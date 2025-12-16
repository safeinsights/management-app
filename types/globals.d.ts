export {}

declare global {
    // V1 format (legacy)
    interface UserOrgMembershipInfoV1 {
        id: string
        slug: string
        isAdmin: boolean
        isReviewer: boolean
        isResearcher: boolean
    }

    // V2 format (new)
    interface UserOrgMembershipInfo {
        id: string
        slug: string
        type: 'enclave' | 'lab'
        isAdmin: boolean
    }

    interface UserInfo {
        format?: 'v3' // Version indicator
        user: {
            id: string
        }
        teams: null
        orgs: {
            [k: string]: UserOrgMembershipInfo
        }
    }

    // Flattened - no longer nested by environment
    interface UserPublicMetadata extends UserInfo {}

    interface UserPreferences {
        currentOrgSlug?: string
    }

    // Flattened - no longer nested by environment
    interface UserUnsafeMetadata extends UserPreferences {}

    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        unsafeMetadata?: UserPreferences
        userMetadata?: UserInfo
    }

    interface Window {
        isReactHydrated: undefined | true
    }
}
