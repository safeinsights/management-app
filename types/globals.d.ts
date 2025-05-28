export {}

declare global {
    interface UserPublicMetadata {
        userId: string
        orgs?: Array<{
            slug: string
            isAdmin: boolean
            isReviewer: boolean
            isResearcher: boolean
        }>
    }
    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        userMetadata?: UserPublicMetadata
    }
    interface Window {
        isReactHydrated: undefined | true
    }
}
