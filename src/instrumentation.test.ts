import { describe, expect, it, type Mock } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { captureRequestError } from '@sentry/nextjs'
import { onRequestError } from './instrumentation'
import { actionResult } from '@/lib/utils'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    captureRequestError: vi.fn(),
}))

const capture = captureRequestError as Mock
const request = { path: '/x', method: 'GET', headers: {} }
const context = { routerKind: 'App Router', routePath: '/x', routeType: 'render', revalidateReason: undefined } as const

describe('onRequestError', () => {
    it('skips an expected action failure re-thrown by actionResult', async () => {
        let thrown: unknown
        try {
            actionResult({ error: { permission_denied: 'nope' } })
        } catch (error) {
            thrown = error
        }
        await onRequestError(thrown, request, context)
        expect(capture).not.toHaveBeenCalled()
    })

    it('reports every other error', async () => {
        const boom = new Error('boom')
        await onRequestError(boom, request, context)
        expect(capture).toHaveBeenCalledWith(boom, request, context)
    })
})
