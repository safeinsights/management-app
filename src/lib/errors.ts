import { capitalize } from 'remeda'

export type ClerkAPIErrorObject = {
    code: string
    message: string
    longMessage?: string
    meta?: {
        paramName: string
    }
}

export type ClerkAPIErrorResponse = {
    errors: [ClerkAPIErrorObject, ...ClerkAPIErrorObject[]]
}

export function isClerkApiError(error: unknown): error is ClerkAPIErrorResponse {
    return Boolean(
        error != null &&
            typeof error === 'object' &&
            'errors' in error &&
            Array.isArray(error.errors) &&
            error.errors?.[0].code,
    )
}

export function extractClerkCodeAndMessage(error: ClerkAPIErrorResponse) {
    const err = error.errors[0]
    return { code: err.code, message: err.longMessage || err.message }
}

export type ErrorResponse = {
    isError: true
    errorMessage: string
}

export function extractActionFailure(error: unknown): Record<string, string> | null {
    if (isServerActionError(error)) {
        try {
            const encoded = JSON.parse(error.message)
            return extractActionFailure(encoded)
        } catch {}
        return null
    }
    if (
        error != null &&
        typeof error === 'object' &&
        'isSanitizedError' in error &&
        'sanitizedError' in error &&
        error['isSanitizedError'] === true
    ) {
        return error.sanitizedError as Record<string, string>
    }
    return null
}

export function isActionFailure(error: unknown): error is ErrorResponse {
    return extractActionFailure(error) !== null
}

type ServerActionError = {
    digest: string
    name: string
    Error: string
    message: string
    stack?: string
    environmentName: 'Server'
}

// a special error that can be thrown from
// a server action with a message that is safe to display to users
export class ActionFailure extends Error {
    constructor(sanitizedError: Record<string, string>) {
        super(JSON.stringify({ isSanitizedError: true, sanitizedError }))
    }
}

export function isServerActionError(error: unknown): error is ServerActionError {
    return (
        error != null &&
        typeof error === 'object' &&
        'environmentName' in error &&
        error['environmentName'] === 'Server'
    )
}

export const errorToString = (error: unknown, clerkOverrides?: Record<string, string>) => {
    if (!error) return ''

    if (typeof error === 'string') {
        return error
    }
    const actionFailure = extractActionFailure(error)
    if (actionFailure) {
        return Object.entries(actionFailure)
            .map(([field, msg]) => `${capitalize(field)} ${msg}`)
            .join(', ')
    }

    if (isServerActionError(error)) {
        return `An unexpected error occurred on the server.\nDigest: ${error.digest}`
    }

    if (isClerkApiError(error)) {
        if (clerkOverrides) {
            const customError = error.errors.find((e) => clerkOverrides[e.code])
            if (customError) return clerkOverrides[customError.code]
        }
        return error.errors.map((e) => `${e.longMessage || e.message}`).join('\n')
    }

    if (error instanceof Error) {
        return String(error)
    }

    return 'Unknown error occured'
}

export class AccessDeniedError extends ActionFailure {}

// a utility function to throw an AccessDeniedError with a message
// useful for passing into kysely's takeFirstOrThrow
export const throwAccessDenied = (part: string) => () =>
    new AccessDeniedError({ user: `not allowed access to ${part}` })

export const throwNotFound = (part: string) => () => new AccessDeniedError({ user: `${part} was not found` })
