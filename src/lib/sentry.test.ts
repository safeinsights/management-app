import { describe, it, expect } from '@/tests/unit.helpers'
import type { ErrorEvent, Event, Log } from '@sentry/nextjs'
import { scrubSentryEvent, scrubSentryLog, scrubSentryTransaction, scrubText, sentryScrubOptions } from './sentry'

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
    return { type: undefined, ...overrides } as ErrorEvent
}

describe('scrubSentryEvent', () => {
    it('redacts sensitive request headers regardless of casing', () => {
        const event = makeEvent({
            request: {
                headers: {
                    Authorization: 'Bearer abc',
                    cookie: '__session=xyz',
                    'Set-Cookie': '__session=xyz; HttpOnly',
                    'X-Api-Key': 'secret',
                    'User-Agent': 'tests',
                },
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.request?.headers).toEqual({
            Authorization: '[Filtered]',
            cookie: '[Filtered]',
            'Set-Cookie': '[Filtered]',
            'X-Api-Key': '[Filtered]',
            'User-Agent': 'tests',
        })
    })

    it('scrubs every header value and redacts headers whose names look sensitive', () => {
        const event = makeEvent({
            request: {
                headers: {
                    Referer: 'https://x.test/accept?token=abc&email=pat@example.org&page=2',
                    'x-amzn-oidc-data': 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl',
                    'x-session-token': 'tok',
                    'x-amzn-oidc-accesstoken': 'opaque',
                    'User-Agent': 'tests',
                },
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.request?.headers).toEqual({
            Referer: 'https://x.test/accept?token=[Filtered]&email=[Filtered]&page=2',
            'x-amzn-oidc-data': '[Filtered]',
            'x-session-token': '[Filtered]',
            'x-amzn-oidc-accesstoken': '[Filtered]',
            'User-Agent': 'tests',
        })
    })

    it('redacts every cookie value in request.cookies', () => {
        const event = makeEvent({
            request: {
                cookies: { __session: 'abc', csrf: 'xyz' },
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.request?.cookies).toEqual({
            __session: '[Filtered]',
            csrf: '[Filtered]',
        })
    })

    it('redacts sensitive keys in request body data, recursively', () => {
        const event = makeEvent({
            request: {
                data: {
                    email: 'user@example.com',
                    password: 'hunter2',
                    nested: { api_key: 'k', safe: 'ok' },
                    list: [{ access_token: 't', other: 'fine' }],
                },
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.request?.data).toEqual({
            email: '[Filtered]',
            password: '[Filtered]',
            nested: { api_key: '[Filtered]', safe: 'ok' },
            list: [{ access_token: '[Filtered]', other: 'fine' }],
        })
    })

    it('scrubs a JSON string request body, including nested values under sensitive keys', () => {
        const event = makeEvent({
            request: {
                data: '{"password":"hunter2","token":"abc","email":"pat@example.org","credentials":{"user":"u"},"page":2}',
            },
        })

        const result = scrubSentryEvent(event)

        expect(JSON.parse(result.request?.data as string)).toEqual({
            password: '[Filtered]',
            token: '[Filtered]',
            email: '[Filtered]',
            credentials: '[Filtered]',
            page: 2,
        })
    })

    it('scrubs a form-encoded string request body', () => {
        const event = makeEvent({
            request: { data: 'password=hunter2&note=pat%40example.org&page=2' },
        })

        expect(scrubSentryEvent(event).request?.data).toBe('password=[Filtered]&note=[Filtered]&page=2')
    })

    it('redacts sensitive keys in a query_string string', () => {
        const event = makeEvent({
            request: {
                query_string: 'token=abc&page=2&api_key=xyz',
            },
        })

        const result = scrubSentryEvent(event)

        const params = new URLSearchParams(result.request?.query_string as string)
        expect(params.get('token')).toBe('[Filtered]')
        expect(params.get('api_key')).toBe('[Filtered]')
        expect(params.get('page')).toBe('2')
    })

    it('redacts sensitive keys in a query_string tuple array', () => {
        const event = makeEvent({
            request: {
                query_string: [
                    ['token', 'abc'],
                    ['page', '2'],
                ],
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.request?.query_string).toEqual([
            ['token', '[Filtered]'],
            ['page', '2'],
        ])
    })

    it('scrubs values of other params in a query_string string, including URL-encoded emails', () => {
        const event = makeEvent({
            request: { query_string: 'q=pat%40example.org&x=pat@example.org&page=2' },
        })

        const params = new URLSearchParams(scrubSentryEvent(event).request?.query_string as string)

        expect(params.get('q')).toBe('[Filtered]')
        expect(params.get('x')).toBe('[Filtered]')
        expect(params.get('page')).toBe('2')
    })

    it('scrubs values of other params in a query_string tuple array', () => {
        const event = makeEvent({
            request: {
                query_string: [
                    ['q', 'pat@example.org'],
                    ['page', '2'],
                ],
            },
        })

        expect(scrubSentryEvent(event).request?.query_string).toEqual([
            ['q', '[Filtered]'],
            ['page', '2'],
        ])
    })

    it('redacts sensitive keys in event.extra', () => {
        const event = makeEvent({
            extra: { authorization: 'Bearer x', componentStack: 'stack' },
        })

        const result = scrubSentryEvent(event)

        expect(result.extra).toEqual({
            authorization: '[Filtered]',
            componentStack: 'stack',
        })
    })

    it('leaves the event untouched when there is no request payload', () => {
        const event = makeEvent({ message: 'hi' })
        const result = scrubSentryEvent(event)
        expect(result).toBe(event)
        expect(result.request).toBeUndefined()
    })
})

describe('scrubSentryEvent, paths outside request', () => {
    it('scrubs breadcrumb messages and data', () => {
        const event = makeEvent({
            breadcrumbs: [
                {
                    category: 'fetch',
                    message: 'mailed pat@example.org',
                    data: { url: 'https://x.test/api?token=abc', authorization: 'Bearer q' },
                },
            ],
        })

        const [crumb] = scrubSentryEvent(event).breadcrumbs!

        expect(crumb.message).toBe('mailed [Filtered]')
        expect(crumb.data).toEqual({ url: 'https://x.test/api?token=[Filtered]', authorization: '[Filtered]' })
    })

    it('scrubs exception values and stack-frame variables', () => {
        const event = makeEvent({
            exception: {
                values: [
                    {
                        type: 'Error',
                        value: 'no user pat@example.org',
                        stacktrace: { frames: [{ function: 'f', vars: { password: 'p', count: 2 } }] },
                    },
                ],
            },
        })

        const [exception] = scrubSentryEvent(event).exception!.values!

        expect(exception.value).toBe('no user [Filtered]')
        expect(exception.stacktrace!.frames![0].vars).toEqual({ password: '[Filtered]', count: 2 })
    })

    it('scrubs the message and the request url, and keeps only the user id', () => {
        const event = makeEvent({
            message: 'failed for pat@example.org',
            request: { url: 'https://x.test/a?token=abc' },
            user: { id: 'u1', email: 'pat@example.org', ip_address: '1.2.3.4' },
        })

        const result = scrubSentryEvent(event)

        expect(result.message).toBe('failed for [Filtered]')
        expect(result.request?.url).toBe('https://x.test/a?token=[Filtered]')
        expect(result.user).toEqual({ id: 'u1' })
    })
})

describe('key and text matching', () => {
    it('redacts camelCase keys and the newly listed terms', () => {
        const event = makeEvent({
            extra: {
                userEmail: 'pat@example.org',
                bearerValue: 'x',
                jwt: 'x',
                ssn: '123',
                phoneNumber: '555',
                apiTokens: ['t'],
                componentStack: 'stack',
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.extra).toEqual({
            userEmail: '[Filtered]',
            bearerValue: '[Filtered]',
            jwt: '[Filtered]',
            ssn: '[Filtered]',
            phoneNumber: '[Filtered]',
            apiTokens: '[Filtered]',
            componentStack: 'stack',
        })
    })

    it('redacts emails, bearer tokens, JWTs and sensitive query params inside free text', () => {
        expect(
            scrubText('sent to pat@example.org with Bearer abc.def and eyJa.eyJb.sig, see /x?token=abc&page=2'),
        ).toBe('sent to [Filtered] with Bearer [Filtered] and [Filtered], see /x?token=[Filtered]&page=2')
    })

    it('keeps allow-listed keys that only look sensitive', () => {
        const event = makeEvent({
            extra: {
                tokenCount: 3,
                tokenType: 'bearer',
                sessionStorage: 'local',
                emailConflictResolved: true,
                emailMatches: false,
                passwordSet: true,
                passwordTouched: false,
                authFailureCode: 'mfa_required',
                phoneVerifyAttempt: 1,
            },
        })

        const result = scrubSentryEvent(event)

        expect(result.extra).toEqual({
            tokenCount: 3,
            tokenType: 'bearer',
            sessionStorage: 'local',
            emailConflictResolved: true,
            emailMatches: false,
            passwordSet: true,
            passwordTouched: false,
            authFailureCode: 'mfa_required',
            phoneVerifyAttempt: 1,
        })
    })

    it('still scrubs an email inside an allow-listed key value', () => {
        const event = makeEvent({
            extra: { authFailureCode: 'no user pat@example.org' },
        })

        const result = scrubSentryEvent(event)

        expect(result.extra).toEqual({ authFailureCode: 'no user [Filtered]' })
    })

    it('still redacts a camelCase key not on the allow-list', () => {
        const event = makeEvent({
            extra: { sessionId: 'abc123' },
        })

        const result = scrubSentryEvent(event)

        expect(result.extra).toEqual({ sessionId: '[Filtered]' })
    })
})

describe('scrubSentryTransaction', () => {
    it('scrubs span descriptions, span data and breadcrumbs', () => {
        const event = {
            type: 'transaction',
            spans: [
                {
                    span_id: '1',
                    trace_id: 't',
                    start_timestamp: 0,
                    description: 'GET /api/x?token=abc',
                    data: {
                        'http.query': '?api_key=k&page=1',
                        authorization: 'Bearer z',
                        'http.request.header.authorization': 'x',
                        'user.email_hash': 'h',
                    },
                },
            ],
            breadcrumbs: [{ message: 'pat@example.org' }],
        } as unknown as Event

        const result = scrubSentryTransaction(event)

        expect(result.spans![0].description).toBe('GET /api/x?token=[Filtered]')
        expect(result.spans![0].data).toEqual({
            'http.query': '?api_key=[Filtered]&page=1',
            authorization: '[Filtered]',
            'http.request.header.authorization': '[Filtered]',
            'user.email_hash': '[Filtered]',
        })
        expect(result.breadcrumbs![0].message).toBe('[Filtered]')
    })
})

describe('scrubSentryLog', () => {
    it('scrubs the log message and attributes', () => {
        const log: Log = {
            level: 'error',
            message: 'login failed for pat@example.org',
            attributes: { 'sentry.message.parameter.0': 'Bearer abc', token: 't', route: '/x' },
        }

        expect(scrubSentryLog(log)).toEqual({
            level: 'error',
            message: 'login failed for [Filtered]',
            attributes: { 'sentry.message.parameter.0': 'Bearer [Filtered]', token: '[Filtered]', route: '/x' },
        })
    })
})

describe('scrubSentryLog, console log bodies', () => {
    it('scrubs a JSON body logged inside an object argument', () => {
        const arg = { route: '/hook', body: '{"password":"hunter2","note":"ok"}' }
        const log: Log = {
            level: 'error',
            message: `webhook failed { route: '/hook', body: '{"password":"hunter2","note":"ok"}' }`,
            attributes: { 'sentry.message.parameter.0': arg },
        }

        const result = scrubSentryLog(log)

        expect(result.message).toBe(`webhook failed { route: '/hook', body: '{"password":"[Filtered]","note":"ok"}' }`)
        expect(result.attributes).toEqual({
            'sentry.message.parameter.0': { route: '/hook', body: '{"password":"[Filtered]","note":"ok"}' },
        })
    })
})

describe('scrubSentryLog, raw console arguments', () => {
    function scrubParam(param: unknown): unknown {
        const log: Log = { level: 'error', message: 'm', attributes: { 'sentry.message.parameter.0': param } }
        return scrubSentryLog(log).attributes?.['sentry.message.parameter.0']
    }

    it('marks cycles instead of overflowing the stack', () => {
        const cyclic: Record<string, unknown> = { note: 'pat@example.org' }
        cyclic.self = cyclic

        expect(scrubParam(cyclic)).toEqual({ note: '[Filtered]', self: '[Circular]' })
    })

    it('keeps an object referenced twice without a cycle', () => {
        const shared = { page: 2 }

        expect(scrubParam({ a: shared, b: shared })).toEqual({ a: { page: 2 }, b: { page: 2 } })
    })

    it('stops at a maximum depth', () => {
        let deep: Record<string, unknown> = { leaf: 'pat@example.org' }
        for (let i = 0; i < 10_000; i++) deep = { next: deep }

        expect(JSON.stringify(scrubParam(deep))).toContain('[Truncated]')
    })

    it('scrubs a deeply nested JSON string without throwing', () => {
        const nested = `${'['.repeat(50_000)}"pat@example.org"${']'.repeat(50_000)}`

        expect(scrubParam(nested)).not.toContain('pat@example.org')
    })

    it('turns dates into ISO strings and binary data into a marker', () => {
        expect(scrubParam({ at: new Date(0), bytes: new Uint8Array([1, 2]) })).toEqual({
            at: '1970-01-01T00:00:00.000Z',
            bytes: '[binary]',
        })
    })

    it('keeps the name, message and stack of an error, scrubbed', () => {
        const scrubbed = scrubParam(new Error('no user pat@example.org')) as Record<string, string>

        expect(scrubbed.name).toBe('Error')
        expect(scrubbed.message).toBe('no user [Filtered]')
        expect(scrubbed.stack).toContain('no user [Filtered]')
    })

    it('redacts an object whose getter throws', () => {
        const hostile = Object.defineProperty({}, 'x', {
            enumerable: true,
            get() {
                throw new Error('no')
            },
        })

        expect(scrubParam(hostile)).toBe('[Filtered]')
    })
})

describe('sentryScrubOptions', () => {
    // Guards the wiring: every runtime's Sentry.init spreads this object, so a hook
    // pointing at the wrong function silently stops scrubbing for that event type.
    it('wires each hook to its scrubber', () => {
        expect(sentryScrubOptions.beforeSend).toBe(scrubSentryEvent)
        expect(sentryScrubOptions.beforeSendTransaction).toBe(scrubSentryTransaction)
        expect(sentryScrubOptions.beforeSendLog).toBe(scrubSentryLog)
    })
})
