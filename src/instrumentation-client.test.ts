import { describe, expect, it, type Mock } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { init } from '@sentry/nextjs'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    init: vi.fn(),
    // Browser-only, so missing from the server build of the SDK that vitest resolves.
    captureRouterTransitionStart: vi.fn(),
}))

// SE-003 requires Session Replay to stay off (OTTER-708).
describe('client Sentry init', () => {
    it('does not record session replays', async () => {
        await import('./instrumentation-client')
        const options = (init as Mock).mock.calls[0][0]

        expect(options.integrations ?? []).not.toContainEqual(expect.objectContaining({ name: 'Replay' }))
        expect(options.replaysSessionSampleRate ?? 0).toBe(0)
        expect(options.replaysOnErrorSampleRate ?? 0).toBe(0)
    })
})
