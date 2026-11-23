import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import posthog from 'posthog-js'
import PostHogUserProvider from './posthog-user-provider'

describe('PostHogUserProvider', () => {
    it('identifies the user once the session loads', () => {
        const identifySpy = vi.spyOn(posthog, 'identify').mockImplementation(() => posthog)
        mockClerkSession({ userId: 'user-123', clerkUserId: 'clerk-user-123', orgSlug: 'org' })

        renderWithProviders(<PostHogUserProvider />)

        expect(identifySpy).toHaveBeenCalledWith('user-123')
    })

    it('does not identify before the session is loaded', () => {
        const identifySpy = vi.spyOn(posthog, 'identify').mockImplementation(() => posthog)
        mockClerkSession(null)

        renderWithProviders(<PostHogUserProvider />)

        expect(identifySpy).not.toHaveBeenCalled()
    })
})
