import { describe, it, expect } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { scrubSentryEvent } from './sentry'

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
