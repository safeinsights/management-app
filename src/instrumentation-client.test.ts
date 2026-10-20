import { describe, expect, it, type Mock } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { init } from '@sentry/nextjs'

vi.mock('@sentry/nextjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/nextjs')>()),
    init: vi.fn(),
    // Browser-only, so missing from the server build of the SDK that vitest resolves.
    captureRouterTransitionStart: vi.fn(),
}))

// The root layout renders these; set before the module runs its init.
document.documentElement.setAttribute('data-sentry-environment', 'staging')
document.documentElement.setAttribute('data-sentry-release', 'v1.6.9')

// The module initializes once, and mock calls are cleared before each test, so capture them here.
await import('./instrumentation-client')
const options = (init as Mock).mock.calls[0][0]

describe('client Sentry init', () => {
    // SE-003 requires Session Replay to stay off (OTTER-708).
    it('does not record session replays', () => {
        expect(options.integrations ?? []).not.toContainEqual(expect.objectContaining({ name: 'Replay' }))
        expect(options.replaysSessionSampleRate ?? 0).toBe(0)
        expect(options.replaysOnErrorSampleRate ?? 0).toBe(0)
    })

    it('reports the environment and release the server rendered into the page', () => {
        expect(options.environment).toBe('staging')
        expect(options.release).toBe('v1.6.9')
    })
})
