import * as Sentry from '@sentry/nextjs'
import type { ErrorEvent, EventHint } from '@sentry/nextjs'
import { UserSession } from './types'

export function setSentryFromSession(session: UserSession) {
    Sentry.setUser({ id: session.user.id })
    Sentry.setTag('orgs', Object.keys(session.orgs).join(','))
}

const SENSITIVE_HEADER_NAMES = [
    'authorization',
    'cookie',
    'set-cookie',
    'proxy-authorization',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-clerk-auth-token',
]

// Tested against snake_case, so camelCase keys such as `userEmail` match too. Final list agreed
// with InfoSec (OTTER-707).
const SENSITIVE_KEY_PATTERN =
    /(^|[_-])(authorization|auth|bearer|jwt|password|passwd|secret|token|api[_-]?key|session|cookie|credential|private[_-]?key|access[_-]?key|e[_-]?mail|ssn|phone|dob|birth[_-]?date)([_-]|$)/i

const REDACTED = '[Filtered]'

const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g
const BEARER_PATTERN = /\b(Bearer\s+)[\w.~+/-]+=*/gi
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
// The key excludes `?` and `/`, or a whole URL at the start of a string reads as one key.
const QUERY_PARAM_PATTERN = /(^|[?&;])([^=&#?/\s]+)=([^&#\s]*)/g

function isSensitiveKey(key: string): boolean {
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

function scrubDeep(value: unknown): unknown {
    if (typeof value === 'string') return scrubText(value)
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(scrubDeep)
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
        out[key] = isSensitiveKey(key) ? REDACTED : scrubDeep(inner)
    }
    return out
}

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) return headers
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
        if (SENSITIVE_HEADER_NAMES.includes(name.toLowerCase())) {
            out[name] = REDACTED
        } else {
            out[name] = value
        }
    }
    return out
}

function scrubQueryString(qs: unknown): unknown {
    if (!qs) return qs
    if (typeof qs === 'string') {
        try {
            const params = new URLSearchParams(qs)
            let mutated = false
            for (const key of Array.from(params.keys())) {
                if (isSensitiveKey(key)) {
                    params.set(key, REDACTED)
                    mutated = true
                }
            }
            return mutated ? params.toString() : qs
        } catch {
            return qs
        }
    }
    if (Array.isArray(qs)) {
        return qs.map((entry) => {
            if (Array.isArray(entry) && entry.length === 2 && isSensitiveKey(String(entry[0]))) {
                return [entry[0], REDACTED]
            }
            return entry
        })
    }
    return scrubDeep(qs)
}

function scrubCookies(cookies: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!cookies) return cookies
    const out: Record<string, string> = {}
    for (const name of Object.keys(cookies)) {
        out[name] = REDACTED
    }
    return out
}

export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
    if (event.request) {
        event.request.headers = scrubHeaders(event.request.headers)
        event.request.cookies = scrubCookies(event.request.cookies)
        event.request.query_string = scrubQueryString(event.request.query_string) as typeof event.request.query_string
        event.request.data = scrubDeep(event.request.data)
    }
    if (event.extra) {
        event.extra = scrubDeep(event.extra) as Record<string, unknown>
    }
    if (event.contexts) {
        event.contexts = scrubDeep(event.contexts) as typeof event.contexts
    }
    return event
}
