export {}

declare global {
    interface CustomJwtSessionClaims {
        hasMFA?: boolean
    }
    interface UserPublicMetadata {
        userId: string
        orgs?: Array<{
            slug: string
            isAdmin: boolean
            isReviewer: boolean
            isResearcher: boolean
        }>
    }
}
