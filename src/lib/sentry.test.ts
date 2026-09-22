import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubSentryEvent, sentryInitOptions } from './sentry'

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
            email: 'user@example.com',
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

describe('sentryInitOptions', () => {
    // The review worker Lambda builds its own init, and shipping events the other entry points
    // would have scrubbed is the drift this helper exists to stop (OTTER-799).
    it('scrubs on every entry point that uses it', () => {
        expect(sentryInitOptions({ dsn: 'https://key@example.ingest.sentry.io/1' }).beforeSend).toBe(scrubSentryEvent)
    })

    it('disables the SDK when no dsn is configured, rather than sending nowhere', () => {
        expect(sentryInitOptions({ dsn: undefined }).enabled).toBe(false)
        expect(sentryInitOptions({ dsn: '' }).enabled).toBe(false)
        expect(sentryInitOptions({ dsn: 'https://key@example.ingest.sentry.io/1' }).enabled).toBe(true)
    })

    it('passes release and environment through, and leaves them unset when not given', () => {
        const tagged = sentryInitOptions({ dsn: 'd', release: 'v1', environment: 'staging' })
        expect(tagged.release).toBe('v1')
        expect(tagged.environment).toBe('staging')

        const bare = sentryInitOptions({ dsn: 'd' })
        expect(bare.release).toBeUndefined()
        expect(bare.environment).toBeUndefined()
    })

    // Sampling is the caller's decision: the worker deliberately runs without tracing.
    it('sets no sampling of its own', () => {
        expect(sentryInitOptions({ dsn: 'd' })).not.toHaveProperty('tracesSampleRate')
    })
})
