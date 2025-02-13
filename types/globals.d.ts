export {}

declare global {
    interface CustomJwtSessionClaims {
        hasMFA?: boolean
    }
}
