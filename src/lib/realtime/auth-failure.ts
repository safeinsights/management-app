/**
 * Wire format for auth failures from `services/editor/auth.ts`: `CODE: message`.
 * Codes mirror the server-side `AuthFailureCode` union; an unknown prefix is
 * treated as a generic auth failure so the client never crashes on a future
 * code the server adds.
 *
 * This union is a superset of the server's: the server splits terminal
 * rejections (AuthFailureError) from the recoverable INFRA_UNAVAILABLE
 * (InfraUnavailableError), but both reach the client over the same wire, so the
 * client lists both. Keep the two in sync by hand (OTTER-626).
 */
export type AuthFailureCode =
    | 'MISSING_TOKEN'
    | 'INVALID_TOKEN'
    | 'UNRECOGNIZED_DOCUMENT'
    | 'USER_NOT_PROVISIONED'
    | 'STUDY_NOT_FOUND'
    | 'NO_MEMBERSHIP'
    | 'STUDY_NOT_EDITABLE'
    // Not an auth rejection: the server hit an infra failure (DB unreachable or
    // rejected its credentials) while authenticating. Recoverable, not terminal
    // — the client retries instead of showing "editor unavailable" (OTTER-626).
    | 'INFRA_UNAVAILABLE'
    | 'UNKNOWN'

const KNOWN_CODES: Record<string, AuthFailureCode> = {
    MISSING_TOKEN: 'MISSING_TOKEN',
    INVALID_TOKEN: 'INVALID_TOKEN',
    UNRECOGNIZED_DOCUMENT: 'UNRECOGNIZED_DOCUMENT',
    USER_NOT_PROVISIONED: 'USER_NOT_PROVISIONED',
    STUDY_NOT_FOUND: 'STUDY_NOT_FOUND',
    NO_MEMBERSHIP: 'NO_MEMBERSHIP',
    STUDY_NOT_EDITABLE: 'STUDY_NOT_EDITABLE',
    INFRA_UNAVAILABLE: 'INFRA_UNAVAILABLE',
}

export type ParsedAuthFailure = {
    code: AuthFailureCode
    message: string
}

export function parseAuthFailureReason(reason: string | undefined | null): ParsedAuthFailure {
    if (!reason) return { code: 'UNKNOWN', message: 'unknown' }
    const idx = reason.indexOf(':')
    if (idx === -1) return { code: 'UNKNOWN', message: reason }
    const prefix = reason.slice(0, idx)
    const message = reason.slice(idx + 1).trim()
    const code = KNOWN_CODES[prefix] ?? 'UNKNOWN'
    return { code, message }
}
