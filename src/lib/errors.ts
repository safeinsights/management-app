import { capitalize } from 'remeda'

export type ClerkAPIErrorObject = {
    code: string
    message: string
    longMessage?: string
    meta?: {
        paramName: string
    }
}

export const clerkErrorOverrides: Record<string, string> = {
    form_password_incorrect: 'Invalid login credentials. Please double-check your email and password.',
    form_identifier_not_found: 'Invalid login credentials. Please double-check your email and password.',
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

// Unified error response type for actions
export type ActionError = {
    error: string | Record<string, string>
}

// Unified response type that can be either data or error
export type ActionResponse<T> = T | ActionError

// Type guard to check if response is an error
export function isActionError(response: unknown): response is ActionError {
    return (
        typeof response === 'object' &&
        response !== null &&
        'error' in response &&
        (typeof (response as { error: unknown }).error === 'string' ||
            (typeof (response as { error: unknown }).error === 'object' &&
                (response as { error: unknown }).error !== null))
    )
}

// Extract error content from various error formats
export function extractActionFailure(error: unknown): string | Record<string, string> | null {
    // Handle direct ActionError responses
    if (isActionError(error)) {
        return error.error
    }

    // Handle server action errors with encoded messages
    if (isServerActionError(error)) {
        try {
            const encoded = JSON.parse(error.message)
            return extractActionFailure(encoded)
        } catch {}
        return null
    }

    // Handle legacy sanitized error format
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

// Exception class that can be thrown from server actions with safe error messages
export class ActionFailure extends Error {
    constructor(public error: ActionError['error']) {
        super(typeof error === 'string' ? error : JSON.stringify(error))
    }
}

export const errorToString = (error: unknown, clerkOverrides?: Record<string, string>) => {
    if (!error) return ''

    if (typeof error === 'string') {
        return error
    }

    // Handle unified ActionError format
    const actionFailure = extractActionFailure(error)
    if (actionFailure) {
        if (typeof actionFailure === 'string') {
            return actionFailure
        } else {
            return Object.entries(actionFailure)
                .map(([field, msg]) => `${capitalize(field)} ${msg}`)
                .join(', ')
        }
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

export class AccessDeniedError extends ActionFailure {
    constructor(sanitizedError: Record<string, string>) {
        super(sanitizedError)
        // Set message for backwards compatibility
        this.message = Object.values(sanitizedError).join(' ')
    }
}

// a utility function to throw an AccessDeniedError with a message
// useful for passing into kysely's takeFirstOrThrow
export const throwAccessDenied = (part: string) => () =>
    new AccessDeniedError({ user: `not allowed access to ${part}` })

export const throwNotFound = (part: string) => () => new AccessDeniedError({ user: `${part} was not found` })
