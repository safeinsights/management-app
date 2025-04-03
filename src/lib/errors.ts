export class AccessDeniedError extends Error {}

// a special error that can be thrown from
// a server action with a message that is safe to display to users
export class SanitizedError extends Error {
    constructor(message: string) {
        super(JSON.stringify({ isSanitizedError: true, sanitizedErrorMessage: message }))
    }
}

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

function extractSanitizedError(error: unknown): string | null {
    if (isServerActionError(error)) {
        try {
            const encoded = JSON.parse(error.message)
            return extractSanitizedError(encoded)
        } catch {}
        return null
    }
    if (
        error != null &&
        typeof error === 'object' &&
        'isSanitizedError' in error &&
        'sanitizedErrorMessage' in error &&
        error['isSanitizedError'] === true
    ) {
        return error.sanitizedErrorMessage as string
    }
    return null
}

export function isSanitizedError(error: unknown): error is ErrorResponse {
    return extractSanitizedError(error) !== null
}

type ServerActionError = {
    digest: string
    name: string
    Error: string
    message: string
    stack?: string
    environmentName: 'Server'
}

export function isServerActionError(error: unknown): error is ServerActionError {
    return (
        error != null &&
        typeof error === 'object' &&
        'environmentName' in error &&
        error['environmentName'] === 'Server'
    )
}

export const errorToString = (error: unknown) => {
    if (!error) return ''

    if (typeof error === 'string') {
        return error
    }
    const sanitizedMsg = extractSanitizedError(error)
    if (sanitizedMsg) {
        return sanitizedMsg
    }

    if (isServerActionError(error)) {
        return `An unexpected error occurred on the server.\nDigest: ${error.digest}`
    }

    if (isClerkApiError(error)) {
        return error.errors.map((e) => `${e.message}: ${e.longMessage}`).join('\n')
    }

    if (error instanceof Error) {
        return String(error)
    }
}

// a utility function to throw an AccessDeniedError with a message
// useful for passing into kysely's takeFirstOrThrow
export const throwAccessDenied = (part: string) => () => new AccessDeniedError(`not allowed access to ${part}`)
