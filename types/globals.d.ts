export {}

declare global {
    interface UserTeamMembershipInfo {
        id: string
        slug: string
        isAdmin: boolean
        isReviewer: boolean
        isResearcher: boolean
    }
    interface UserInfo {
        user: {
            id: string
        }
        teams: {
            [k: string]: UserTeamMembershipInfo
        }
    }

    interface UserPublicMetadata {
        [envId: string]: UserInfo
    }

    interface UserPreferences {
        currentTeamSlug: string
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
    }
}
