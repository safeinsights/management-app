export {}

declare global {
    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        userId?: string
    }
}
