export const REDACTED = '[Filtered]'

// Tested against snake_case, so camelCase keys such as `userEmail` match too. List pending
// InfoSec review (OTTER-707).
const SENSITIVE_KEY_PATTERN =
    /(?:^|[_.-])(?:authorization|auth|bearer|jwt|password|passwd|secret|token|api[_.-]?key|session|cookie|credential|private[_.-]?key|access[_.-]?key|e[_.-]?mail|ssn|phone|dob|birth[_.-]?date)s?(?:[_.-]|$)/i

// No two parts of a pattern can match the same text, and repeated quantifiers are bounded,
// because scrubText runs synchronously on every string sent to Sentry and must stay linear.

// A JWT is only matched at the start of a base64url run, so a run of `eyJ` is scanned once.
const JWT_PATTERN = /(^|[^\w-])eyJ[\w-]{1,8192}\.[\w-]{1,8192}\.[\w-]{1,8192}/g
const AUTH_SCHEME_PATTERN = /\b((?:Bearer|Basic|Token)\s{1,16})[\w.~+/-]{1,8192}={0,2}/gi
// Also matches URL-encoded `@`. The alphabetic TLD keeps `next@15.3.1` style versions.
const EMAIL_PATTERN = /[\w.+%-]{1,64}(?:@|%40)[\w-]{1,63}(?:\.[\w-]{1,63}){0,8}\.[a-z]{2,24}\b/gi
// `key=`, `key:`, `"key":` or `\"key\":` (escaped JSON). The leading non-key character means
// matching only starts at the head of a key, which keeps the scan linear.
const PAIR_KEY_PATTERN = /(?:^|[^\w.-])(\\?["']|)([\w.-]{1,128})\1\s{0,8}[:=]/g
// The value after a sensitive key: a quoted or escaped-quoted string, a one-level array or
// object, or a bare word. Closing marks are optional, as Sentry may have truncated the string.
// Unbounded, so long secrets go whole: the sticky match runs once per key, without overlap.
const PAIR_VALUE_PATTERN =
    /(\s{0,8})(?:"[^"\\]*(?:\\.[^"\\]*)*"?|'[^'\\]*(?:\\.[^'\\]*)*'?|\\"[^"\\]*(?:\\[^"][^"\\]*)*(?:\\")?|\[[^\]]*\]?|\{[^}]*\}?|[^\s"'\\,;&#{}()[\]]+)/y

// Flags and counts whose names only match SENSITIVE_KEY_PATTERN by coincidence. Values still
// go through scrubDeep/scrubText, so an email or token inside them is still redacted. List
// pending InfoSec review (OTTER-707).
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
    const masked = text
        .replace(JWT_PATTERN, `$1${REDACTED}`)
        .replace(AUTH_SCHEME_PATTERN, `$1${REDACTED}`)
        .replace(EMAIL_PATTERN, REDACTED)
    return scrubPairs(masked)
}

function openingQuote(value: string): string {
    if (value.startsWith('\\"')) return '\\"'
    return value[0] === '"' || value[0] === "'" ? value[0] : ''
}

function scrubPairs(text: string): string {
    let out = ''
    let copied = 0
    PAIR_KEY_PATTERN.lastIndex = 0
    for (let key = PAIR_KEY_PATTERN.exec(text); key; key = PAIR_KEY_PATTERN.exec(text)) {
        const valueStart = PAIR_KEY_PATTERN.lastIndex
        // Rescan from the separator, so it can be the boundary before the next key.
        PAIR_KEY_PATTERN.lastIndex = valueStart - 1
        if (!isSensitiveKey(key[2])) continue
        PAIR_VALUE_PATTERN.lastIndex = valueStart
        const value = PAIR_VALUE_PATTERN.exec(text)
        if (!value) continue
        const quote = openingQuote(value[0].slice(value[1].length))
        out += `${text.slice(copied, valueStart)}${value[1]}${quote}${REDACTED}${quote}`
        copied = PAIR_VALUE_PATTERN.lastIndex
        PAIR_KEY_PATTERN.lastIndex = copied
    }
    return out + text.slice(copied)
}
