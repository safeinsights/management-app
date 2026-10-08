import logger from '@/lib/logger'
import { describe, expect, failNextPostHogCapture, flushDeferred, it, postHogCaptures, vi } from '@/tests/unit.helpers'
import { capturePostHogEvent } from './posthog'

describe('capturePostHogEvent', () => {
    it('adds the environment to every event', async () => {
        capturePostHogEvent({ distinctId: 'user-1', event: 'user_logged_in', properties: { org_id: 'org-1' } })
        await flushDeferred()

        expect(postHogCaptures()).toContainEqual({
            distinctId: 'user-1',
            event: 'user_logged_in',
            properties: { org_id: 'org-1', environment: expect.any(String) },
        })
    })

    it('reports a failed send, which posthog-node emits rather than throws', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        failNextPostHogCapture(new Error('PostHog is down'))

        capturePostHogEvent({ distinctId: 'user-1', event: 'user_logged_in' })
        await flushDeferred()

        expect(logError).toHaveBeenCalled()
    })

    it('logs rather than throws when a property lookup fails, and sends nothing', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        capturePostHogEvent({
            distinctId: 'user-1',
            event: 'user_logged_in',
            properties: async () => {
                throw new Error('lookup failed')
            },
        })
        await flushDeferred()

        expect(logError).toHaveBeenCalled()
        expect(postHogCaptures()).toHaveLength(0)
    })
})
