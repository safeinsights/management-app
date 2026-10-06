export const REDACTED = '[Filtered]'

// Tested against snake_case, so camelCase keys such as `userEmail` match too. Final list agreed
// with InfoSec (OTTER-707).
const SENSITIVE_KEY_PATTERN =
    /(^|[_-])(authorization|auth|bearer|jwt|password|passwd|secret|token|api[_-]?key|session|cookie|credential|private[_-]?key|access[_-]?key|e[_-]?mail|ssn|phone|dob|birth[_-]?date)([_-]|$)/i

const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g
const BEARER_PATTERN = /\b(Bearer\s+)[\w.~+/-]+=*/gi
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
// The key excludes `?` and `/`, or a whole URL at the start of a string reads as one key.
const QUERY_PARAM_PATTERN = /(^|[?&;])([^=&#?/\s]+)=([^&#\s]*)/g

// Flags and counts whose names only match SENSITIVE_KEY_PATTERN by coincidence. Values still
// go through scrubDeep/scrubText, so an email or token inside them is still redacted. List
// signed off by InfoSec (OTTER-707).
const ALLOWED_KEYS = new Set([
    'tokenCount',
    'tokenType',
    'sessionStorage',
    'emailConflictResolved',
    'emailMatches',
    'passwordSet',
    'passwordTouched',
    'authFailureCode',
    'phoneVerifyAttempt',
])

export function isSensitiveKey(key: string): boolean {
    if (ALLOWED_KEYS.has(key)) return false
    return SENSITIVE_KEY_PATTERN.test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2'))
}

export function scrubText(text: string): string {
    return text
        .replace(JWT_PATTERN, REDACTED)
        .replace(BEARER_PATTERN, `$1${REDACTED}`)
        .replace(EMAIL_PATTERN, REDACTED)
        .replace(QUERY_PARAM_PATTERN, (match, sep: string, key: string) =>
            isSensitiveKey(key) ? `${sep}${key}=${REDACTED}` : match,
        )
}
