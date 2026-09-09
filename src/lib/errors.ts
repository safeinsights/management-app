import { unstable_isUnrecognizedActionError } from 'next/navigation'
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
    strategy_for_user_invalid: 'Account password is invalid, please reset it by using the forgot password link below.',
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

export type ActionError = {
    error: string | Record<string, string>
}

export type ActionResponse<T> = T | ActionError

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

export function extractActionFailure(error: unknown): string | Record<string, string> | null {
    if (isActionError(error)) {
        return error.error
    }

    if (isServerActionError(error)) {
        try {
            const encoded = JSON.parse(error.message)
            return extractActionFailure(encoded)
        } catch {
            // not JSON-encoded
        }
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

// Next rejects an action id that is missing from the running build's manifest, which is what an
// open tab posts after a deploy moved, renamed or removed that action. No application code can make
// the id resolve, so the only correct response is to replace the client bundle (OTTER-726).
export function isStaleDeploymentError(error: unknown): boolean {
    if (unstable_isUnrecognizedActionError(error)) return true
    return error instanceof Error && error.name === 'UnrecognizedActionError'
}

export const STALE_DEPLOYMENT_MESSAGE =
    'The application was updated while this page was open. Reload the page to continue.'

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

    if (isStaleDeploymentError(error)) {
        return STALE_DEPLOYMENT_MESSAGE
    }

    if (error instanceof Error) {
        return String(error)
    }

    return 'Unknown error occurred'
}

class RecordError extends ActionFailure {
    constructor(sanitizedError: Record<string, string>) {
        super(sanitizedError)
        this.message = Object.values(sanitizedError).join(' ')
    }
}

export class AccessDeniedError extends RecordError {}

export class NotFoundError extends RecordError {}

// For passing into kysely's takeFirstOrThrow.
export const throwAccessDenied = (part: string) => () =>
    new AccessDeniedError({ user: `not allowed access to ${part}` })

export const throwNotFound = (part: string) => () => new NotFoundError({ user: `${part} was not found` })

// 23505 is the Postgres unique_violation SQLSTATE, which node-postgres attaches as `.code`.
export function isPgUniqueViolation(error: unknown): boolean {
    return (
        error != null && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === '23505'
    )
}
