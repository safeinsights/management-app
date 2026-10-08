import * as Sentry from '@sentry/nextjs'
import type { Breadcrumb, ErrorEvent, Event, EventHint, Log } from '@sentry/nextjs'
import { UserSession } from './types'
import { isSensitiveHeader, isSensitiveKey, REDACTED, scrubText } from './sentry-scrub-text'

export function setSentryFromSession(session: UserSession) {
    Sentry.setUser({ id: session.user.id })
    Sentry.setTag('orgs', Object.keys(session.orgs).join(','))
}

const MAX_DEPTH = 20

function parseJsonContainer(text: string): object | undefined {
    const first = text.trimStart().charAt(0)
    if (first !== '{' && first !== '[') return undefined
    try {
        const parsed: unknown = JSON.parse(text)
        return parsed !== null && typeof parsed === 'object' ? parsed : undefined
    } catch {
        return undefined
    }
}

// Raw request bodies and logged payloads are often serialized JSON; parsing them lets key
// matching redact whole nested values, which text matching cannot.
function scrubString(text: string, ancestors: Set<object>): string {
    const parsed = parseJsonContainer(text)
    return parsed === undefined ? scrubText(text) : JSON.stringify(scrubDeep(parsed, ancestors))
}

function scrubError(error: Error): Record<string, string> {
    return {
        name: scrubText(String(error.name ?? '')),
        message: scrubText(String(error.message ?? '')),
        stack: scrubText(String(error.stack ?? '')),
    }
}

// Log attributes hold raw console arguments that the SDK does not normalize, so this must
// survive cycles, deep nesting, class instances and throwing getters.
function scrubObject(value: object, ancestors: Set<object>): unknown {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString()
    if (value instanceof Error) return scrubError(value)
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]'
    if (ancestors.has(value)) return '[Circular]'
    if (ancestors.size >= MAX_DEPTH) return '[Truncated]'
    ancestors.add(value)
    try {
        if (Array.isArray(value)) return value.map((item) => scrubDeep(item, ancestors))
        const out: Record<string, unknown> = {}
        for (const [key, inner] of Object.entries(value)) {
            out[key] = isSensitiveKey(key, inner) ? REDACTED : scrubDeep(inner, ancestors)
        }
        return out
    } catch {
        return REDACTED
    } finally {
        ancestors.delete(value)
    }
}

function scrubDeep(value: unknown, ancestors = new Set<object>()): unknown {
    if (typeof value === 'string') return scrubString(value, ancestors)
    if (value === null || typeof value !== 'object') return value
    return scrubObject(value, ancestors)
}

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
    if (!headers) return headers
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase()
        out[name] = isSensitiveHeader(lower) || isSensitiveKey(lower, value) ? REDACTED : scrubText(value)
    }
    return out
}

function scrubQueryEntry(entry: unknown): unknown {
    if (!Array.isArray(entry) || entry.length !== 2) return scrubDeep(entry)
    return [entry[0], isSensitiveKey(String(entry[0]), entry[1]) ? REDACTED : scrubDeep(entry[1])]
}

function scrubQueryString(qs: unknown): unknown {
    if (!qs) return qs
    if (typeof qs === 'string') return scrubText(qs)
    if (Array.isArray(qs)) return qs.map(scrubQueryEntry)
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
    if (event.transaction) event.transaction = scrubText(event.transaction)
    if (event.tags) event.tags = scrubDeep(event.tags) as typeof event.tags
    if (event.logentry) event.logentry = scrubDeep(event.logentry) as typeof event.logentry
    if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id }
    return event
}

export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
    for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrubText(exception.value)
        if (exception.mechanism?.data) {
            exception.mechanism.data = scrubDeep(exception.mechanism.data) as typeof exception.mechanism.data
        }
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

// The SDK attaches scope-level attributes after beforeSendLog. Do not put sensitive data in
// Sentry.setAttribute or scope.setAttributes; these hooks cannot scrub those attributes.
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
