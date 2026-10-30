import { describe, expect, it, renderHook, vi } from '@/tests/unit.helpers'
import posthog from 'posthog-js'
import { usePostHogInit } from './use-posthog-init'

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
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
        renderHook(() => usePostHogInit('phc_test'))

        expect(captureEvent('before_reset')).toMatchObject({ surface: 'app' })

        posthog.register({ registered: true })
        posthog.reset()

        expect(captureEvent('after_reset')).toMatchObject({ surface: 'app' })
        expect(posthog.get_property('registered')).toBeUndefined()
    })
})
