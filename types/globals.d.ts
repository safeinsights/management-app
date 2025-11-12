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
        format?: 'v2' // Version indicator
        user: {
            id: string
        }
        teams: null
        orgs: {
            [k: string]: UserOrgMembershipInfo
        }
    }

    interface UserPublicMetadata {
        [envId: string]: UserInfo
    }

    interface UserPreferences {
        currentOrgSlug: string
    }

    interface UserUnsafeMetadata {
        [envId: string]: UserPreferences
    }

    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        unsafeMetadata?: {
            [envId: string]: UserPreferences
        }
        userMetadata?: {
            [envId: string]: UserSession
        }
    }

    interface Window {
        isReactHydrated: undefined | true
        SENTRY_DSN?: string
    }
}
