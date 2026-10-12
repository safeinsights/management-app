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

    // A type, not an interface: only a type alias satisfies the index signature on Clerk's own
    // UserPublicMetadata, which updateUser takes.
    type ClerkPublicMetadata = {
        format: 'v3'
        user: { id: string }
        teams: null
    }

    // `orgs` stays optional only for users that the OTTER-752 script has not slimmed yet.
    interface UserPublicMetadata extends ClerkPublicMetadata {
        orgs?: UserInfo['orgs']
    }

    interface UserPreferences {
        currentOrgSlug?: string
    }

    type UserUnsafeMetadata = UserPreferences

    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        unsafeMetadata?: UserPreferences
        userMetadata?: UserPublicMetadata
    }

    interface Window {
        isReactHydrated: undefined | true
    }
}
