export const REDACTED = '[Filtered]'

// Substring matching includes lowercase compound keys. List pending
// InfoSec review (OTTER-707).
const SENSITIVE_KEY_PATTERN =
    /authorization|auth|bearer|jwt|password|passwd|secret|token|api[_.-]?key|session|cookie|credential|private[_.-]?key|access[_.-]?key|e[_.-]?mail|ssn|phone|dob|birth[_.-]?date|date[_.-]?of[_.-]?birth|social[_.-]?security[_.-]?number|first[_.-]?name|last[_.-]?name|otp|verification[_.-]?code|invite/i

// No two parts of a pattern can match the same text, and repeated quantifiers are bounded,
// because scrubText runs synchronously on every string sent to Sentry and must stay linear.

// A JWT is only matched at the start of a base64url run, so a run of `eyJ` is scanned once.
// A URL-encoded char such as `%3D` also starts a run, though its hex digits are word chars.
const JWT_PATTERN = /(^|[^\w-]|%[\dA-Fa-f]{2})eyJ[\w-]{1,8192}\.[\w-]{1,8192}\.[\w-]{1,8192}/g
const BEARER_PATTERN = /\b(Bearer\s{1,16})[\w.~+/-]{1,8192}={0,2}/gi
// Token needs a credential-length value; Basic uses base64 with a decoded user:password pair.
const TOKEN_PATTERN = /\b(Token[ \t]{1,16})[\w.~+/-]{16,8192}={0,2}/gi
const BASIC_PATTERN = /\b(Basic[ \t]{1,16})([A-Za-z0-9+/]{2,8192}={0,2})(?=$|[\s,;])/gi
// Also matches URL-encoded `@`. The alphabetic TLD keeps `next@15.3.1` style versions.
const EMAIL_PATTERN = /[\w.+%-]{1,64}(?:@|%40)[\w-]{1,63}(?:\.[\w-]{1,63}){0,8}\.[a-z]{2,24}\b/gi
// `key=`, `key:`, `"key":` or `\"key\":` (escaped JSON). The leading non-key character means
// matching only starts at the head of a key, which keeps the scan linear.
const PAIR_KEY_PATTERN = /(?:^|[^\w.-])(\\?["']|)([\w.-]{1,128})\1\s{0,8}[:=]/g
// Stack frames read `auth.ts:12:5`; the file name is not a key and the line number is no secret.
const VALUE_WHITESPACE_PATTERN = /\s{0,8}/y
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|json)$/
// The scalar value after a sensitive key. Structured values use a nesting-aware scanner.
// Handles a quoted or escaped-quoted string, or a bare word with an optional auth scheme. Closing marks are optional, as Sentry
// may have truncated the string.
// Unbounded, so long secrets go whole: the sticky match runs once per key, without overlap.
const PAIR_VALUE_PATTERN =
    /(\s{0,8})(?:"[^"\\]*(?:\\.[^"\\]*)*"?|'[^'\\]*(?:\\.[^'\\]*)*'?|\\"[^"\\]*(?:\\[^"][^"\\]*)*(?:\\")?|(?:(?:Bearer|Basic|Token)[ \t]{1,16})?[^\s"'\\,;&#{}()[\]]+)/iy

// Flags and counts whose names only match SENSITIVE_KEY_PATTERN by coincidence. Only boolean
// and numeric values are allowed; strings and containers are redacted. List
// pending InfoSec review (OTTER-707).
const ALLOWED_KEYS = new Set([
    'tokenCount',
    'tokenType',
    'emailConflictResolved',
    'emailMatches',
    'passwordSet',
    'passwordTouched',
    'authFailureCode',
    'phoneVerifyAttempt',
])

const SENSITIVE_HEADER_NAMES = [
    'authorization',
    'cookie',
    'set-cookie',
    'proxy-authorization',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-clerk-auth-token',
    'x-amzn-oidc-accesstoken',
    'x-amzn-oidc-data',
]

export function isSensitiveHeader(key: string): boolean {
    const lower = key.toLowerCase()
    return SENSITIVE_HEADER_NAMES.some((name) => lower === name || lower.endsWith(`.${name}`))
}

function decode(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        // Invalid UTF-8 or a stray percent sign must not hide ASCII URL separators and keys.
        return value.replace(/%([0-7][0-9a-f])/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    }
}

export function isSensitiveKey(key: string, value?: unknown): boolean {
    if (ALLOWED_KEYS.has(key) && (typeof value === 'boolean' || typeof value === 'number')) return false
    return isSensitiveHeader(key) || SENSITIVE_KEY_PATTERN.test(decode(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2'))
}

export function scrubText(text: string): string {
    return scrubTextAtDepth(text, 0)
}

function scrubTextAtDepth(text: string, depth: number): string {
    // Redact whole keyed values before masking embedded credentials, so an auth scheme and
    // its credential are consumed together.
    const masked = scrubPairs(text)
        .replace(
            /\b(?:Set-Cookie|Cookie)[ \t]*:[^\r\n]*/gi,
            (line) => `${line.slice(0, line.indexOf(':') + 1)} ${REDACTED}`,
        )
        .replace(/(\/invitation\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, `$1${REDACTED}`)
        .replace(JWT_PATTERN, `$1${REDACTED}`)
        .replace(BEARER_PATTERN, `$1${REDACTED}`)
        .replace(TOKEN_PATTERN, `$1${REDACTED}`)
        .replace(BASIC_PATTERN, (match, prefix, value) => {
            try {
                return atob(value).includes(':') ? `${prefix}${REDACTED}` : match
            } catch {
                return match
            }
        })
        .replace(EMAIL_PATTERN, REDACTED)
    return scrubEncodedValue(scrubEncodedParams(masked, depth), depth)
}

// Preserve untouched URL bytes (including %20 and a leading ?). Only changed encoded values
// are re-encoded. Two decode steps cover an encoded redirect containing another encoded URL.
function scrubEncodedParams(text: string, depth: number): string {
    return text.replace(/(^|[?&#])([^=\s?&#"'<>]{1,128})=([^\s&#"'<>]*)/g, (match, prefix, key, value) => {
        if (isSensitiveKey(decode(key), scalarValue(value))) return `${prefix}${key}=${REDACTED}`
        const scrubbed = scrubEncodedValue(value, depth)
        return scrubbed === value ? match : `${prefix}${key}=${scrubbed}`
    })
}

function scrubEncodedValue(value: string, depth: number): string {
    if (!value.includes('%')) return value
    const decoded = decode(value)
    if (decoded === value) return value
    // Fail closed for encoding layers beyond the fixed processing budget.
    if (depth >= 2) return REDACTED
    const scrubbed = scrubTextAtDepth(decoded, depth + 1)
    if (scrubbed === decoded) return value
    try {
        return encodeURIComponent(scrubbed)
    } catch {
        return REDACTED
    }
}

function scalarValue(text: string): unknown {
    if (text === 'true') return true
    if (text === 'false') return false
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return Number(text)
    return text
}

// Each character is visited once. Quotes and escapes protect braces inside string values.
// An incomplete or mismatched structure consumes the rest of the message, preventing a tail leak.
function structuredValueEnd(text: string, start: number): number {
    const closings: string[] = []
    let quote = ''
    for (let i = start; i < text.length; i++) {
        const char = text[i]
        if (quote) {
            if (char === '\\') i++
            else if (char === quote) quote = ''
            continue
        }
        if (char === '"' || char === "'") quote = char
        else if (char === '{') closings.push('}')
        else if (char === '[') closings.push(']')
        else if (char === '}' || char === ']') {
            if (closings.pop() !== char) return text.length
            if (closings.length === 0) return i + 1
        }
    }
    return text.length
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
        if (SOURCE_FILE_PATTERN.test(key[2]) || !isSensitiveKey(key[2])) continue
        VALUE_WHITESPACE_PATTERN.lastIndex = valueStart
        const whitespace = VALUE_WHITESPACE_PATTERN.exec(text)![0]
        const contentStart = valueStart + whitespace.length
        if (text[contentStart] === '{' || text[contentStart] === '[') {
            out += `${text.slice(copied, valueStart)}${whitespace}${REDACTED}`
            copied = structuredValueEnd(text, contentStart)
            PAIR_KEY_PATTERN.lastIndex = copied
            continue
        }
        PAIR_VALUE_PATTERN.lastIndex = valueStart
        const value = PAIR_VALUE_PATTERN.exec(text)
        if (!value || !isSensitiveKey(key[2], scalarValue(value[0].trim()))) continue
        const quote = openingQuote(value[0].slice(value[1].length))
        out += `${text.slice(copied, valueStart)}${value[1]}${quote}${REDACTED}${quote}`
        copied = PAIR_VALUE_PATTERN.lastIndex
        PAIR_KEY_PATTERN.lastIndex = copied
    }
    return out + text.slice(copied)
}
