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

    type UserPublicMetadata = UserInfo

    interface UserPreferences {
        currentOrgSlug?: string
    }

    type UserUnsafeMetadata = UserPreferences

    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        unsafeMetadata?: UserPreferences
        userMetadata?: UserInfo
    }

    interface Window {
        isReactHydrated: undefined | true
    }
}
