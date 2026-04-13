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

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges with Clerk's UserPublicMetadata interface
    interface UserPublicMetadata extends UserInfo {}

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
