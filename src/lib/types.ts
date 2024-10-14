export class AccessDeniedError extends Error {}

export type User = null | {
    id: string
    email: string
    roles: string[]
}

export type Member = null | {
    id: string
    name: string
    identifier: string
    publicKey: string
    email: string
}
