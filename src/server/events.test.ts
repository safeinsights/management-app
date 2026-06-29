import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { after } from 'next/server'
import * as Sentry from '@sentry/nextjs'

// after() schedules work post-response; run it inline so the test can observe
// the failure-reporting path synchronously.
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
        // Let the inline after() callback's async catch settle.
        await vi.waitFor(() => expect(captureExceptionMock).toHaveBeenCalledWith(boom))
        // The flush is the actual fix — without it the event is dropped when the
        // serverless instance freezes after the response.
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
