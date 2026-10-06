import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubSentryEvent, scrubText } from './sentry'

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
