import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'

// Run after() inline so the failure-reporting path is observable synchronously.
vi.mock('next/server', () => ({
    after: vi.fn((cb: () => unknown) => cb()),
}))

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
}))

const afterMock = after as unknown as Mock
const captureExceptionMock = Sentry.captureException as unknown as Mock
const flushMock = Sentry.flush as unknown as Mock

describe('deferred', () => {
    beforeEach(() => {
        afterMock.mockImplementation((cb: () => unknown) => cb())
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('captures and flushes to Sentry when the handler rejects', async () => {
        const { deferred } = await import('./events')
        const boom = new Error('handler exploded')
        const run = deferred(async () => {
            throw boom
        })

        run()
        await vi.waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(boom))
        // Without the flush the event is dropped when the instance freezes after the response.
        expect(flushMock).toHaveBeenCalled()
    })

    it('does not report when the handler resolves', async () => {
        const { deferred } = await import('./events')
        const run = deferred(async () => undefined)

        run()
        await vi.waitFor(() => expect(afterMock).toHaveBeenCalled())
        expect(captureExceptionMock).not.toHaveBeenCalled()
        expect(flushMock).not.toHaveBeenCalled()
    })
})
