import * as Sentry from '@sentry/nextjs'
import type { Breadcrumb, ErrorEvent, Event, EventHint, Log } from '@sentry/nextjs'
import { UserSession } from './types'
import { isSensitiveKey, REDACTED, scrubText } from './sentry-scrub-text'

export { scrubText }

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

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
    return {
        ...crumb,
        message: crumb.message === undefined ? undefined : scrubText(crumb.message),
        data: crumb.data && (scrubDeep(crumb.data) as Breadcrumb['data']),
    }
}

// Paths that error and transaction events share.
function scrubCommon<T extends Event>(event: T): T {
    if (event.request) {
        if (event.request.url) event.request.url = scrubText(event.request.url)
        event.request.headers = scrubHeaders(event.request.headers)
        event.request.cookies = scrubCookies(event.request.cookies)
        event.request.query_string = scrubQueryString(event.request.query_string) as typeof event.request.query_string
        event.request.data = scrubDeep(event.request.data)
    }
    if (event.extra) event.extra = scrubDeep(event.extra) as Record<string, unknown>
    if (event.contexts) event.contexts = scrubDeep(event.contexts) as typeof event.contexts
    if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
    if (event.message) event.message = scrubText(event.message)
    if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id }
    return event
}

export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
    for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrubText(exception.value)
        for (const frame of exception.stacktrace?.frames ?? []) {
            if (frame.vars) frame.vars = scrubDeep(frame.vars) as typeof frame.vars
        }
    }
    return scrubCommon(event)
}

export function scrubSentryTransaction<T extends Event>(event: T): T {
    for (const span of event.spans ?? []) {
        if (span.description) span.description = scrubText(span.description)
        if (span.data) span.data = scrubDeep(span.data) as typeof span.data
    }
    return scrubCommon(event)
}

export function scrubSentryLog(log: Log): Log {
    return {
        ...log,
        message: scrubText(String(log.message)),
        attributes: log.attributes && (scrubDeep(log.attributes) as Log['attributes']),
    }
}

// Spread into every Sentry.init, so each runtime gets every hook.
export const sentryScrubOptions = {
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryTransaction,
    beforeSendLog: scrubSentryLog,
}
