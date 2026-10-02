import logger from '@/lib/logger'
import { describe, expect, failNextPostHogCapture, it, postHogCaptures, vi } from '@/tests/unit.helpers'
import { capturePostHogEvent } from './posthog'

describe('capturePostHogEvent', () => {
    it('adds the environment to every event', async () => {
        await capturePostHogEvent({ distinctId: 'user-1', event: 'user_logged_in', properties: { org_id: 'org-1' } })

        expect(postHogCaptures()).toContainEqual({
            distinctId: 'user-1',
            event: 'user_logged_in',
            properties: { org_id: 'org-1', environment: expect.any(String) },
        })
    })

    it('reports a failed send, which posthog-node emits rather than throws', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        failNextPostHogCapture(new Error('PostHog is down'))

        await expect(capturePostHogEvent({ distinctId: 'user-1', event: 'user_logged_in' })).resolves.toBeUndefined()
        expect(logError).toHaveBeenCalled()
    })

    it('resolves rather than throws when a property lookup fails, and sends nothing', async () => {
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        await expect(
            capturePostHogEvent({
                distinctId: 'user-1',
                event: 'user_logged_in',
                properties: async () => {
                    throw new Error('lookup failed')
                },
            }),
        ).resolves.toBeUndefined()
        expect(postHogCaptures()).toHaveLength(0)
    })
})
