import { PostHog } from 'posthog-node'
import { vi } from 'vitest'

const postHogCaptureMock = () => vi.mocked(PostHog.prototype.captureImmediate)

export const postHogCaptures = () => postHogCaptureMock().mock.calls.map(([event]) => event)

// posthog-node reports a failed send through its 'error' event rather than rejecting, as the mock does.
export const failNextPostHogCapture = (error: Error) =>
    postHogCaptureMock().mockImplementationOnce(async function (this: { emitError(error: unknown): void }) {
        this.emitError(error)
    } as never)
