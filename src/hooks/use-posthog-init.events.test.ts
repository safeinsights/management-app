import { describe, expect, it, renderHook } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import posthog from 'posthog-js'
import { usePostHogInit } from './use-posthog-init'

// posthog-js keeps the fetch it finds at import, so the stub has to land first. Not
// vi.fn().mockResolvedValue: mockReset clears that before the test runs.
vi.hoisted(() => {
    globalThis.fetch = () => Promise.resolve(new Response('{}'))
})

const captureEvent = (name: string) => {
    const events: { properties: Record<string, unknown> }[] = []
    const stop = posthog.on('eventCaptured', (event) => events.push(event))
    posthog.capture(name)
    stop()
    return events[0].properties
}

describe('usePostHogInit surface', () => {
    it('tags events after init and after reset(), which clears registered properties', () => {
        // posthog-js drops events from what it takes for a bot, and happy-dom reports webdriver.
        vi.spyOn(navigator, 'webdriver', 'get').mockReturnValue(false)
        renderHook(() => usePostHogInit('phc_test'))

        expect(captureEvent('before_reset')).toMatchObject({ surface: 'app' })

        posthog.register({ registered: true })
        posthog.reset()

        expect(captureEvent('after_reset')).toMatchObject({ surface: 'app' })
        expect(posthog.get_property('registered')).toBeUndefined()
    })
})
