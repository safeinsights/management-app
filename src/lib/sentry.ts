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

const SENSITIVE_KEY_PATTERN =
    /(^|[_-])(authorization|auth|password|passwd|secret|token|api[_-]?key|session|cookie|credential|private[_-]?key|access[_-]?key)([_-]|$)/i

const REDACTED = '[Filtered]'

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

function scrubObjectKeys(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    if (Array.isArray(obj)) return obj.map(scrubObjectKeys)
    if (typeof obj !== 'object') return obj
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            out[key] = REDACTED
        } else {
            out[key] = scrubObjectKeys(value)
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
                if (SENSITIVE_KEY_PATTERN.test(key)) {
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
            if (Array.isArray(entry) && entry.length === 2 && SENSITIVE_KEY_PATTERN.test(String(entry[0]))) {
                return [entry[0], REDACTED]
            }
            return entry
        })
    }
    return scrubObjectKeys(qs)
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
        event.request.data = scrubObjectKeys(event.request.data)
    }
    if (event.extra) {
        event.extra = scrubObjectKeys(event.extra) as Record<string, unknown>
    }
    if (event.contexts) {
        event.contexts = scrubObjectKeys(event.contexts) as typeof event.contexts
    }
    return event
}
