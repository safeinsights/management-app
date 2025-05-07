export {}

declare global {
    interface CustomJwtSessionClaims {
        hasMFA?: boolean
    }
    interface UserPublicMetadata {
        userId: string
        orgs: Array<{
            id: string
            slug: string
            isAdmin: boolean
            isReviewer: boolean
            isResearcher: boolean
        }>
    }
}
