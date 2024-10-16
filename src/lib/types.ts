export class AccessDeniedError extends Error {}

export type User = {
    id: string
    email: string
    roles: string[]
}

export type Member = {
    id: string
    name: string
    identifier: string
    publicKey: string
    email: string
}
