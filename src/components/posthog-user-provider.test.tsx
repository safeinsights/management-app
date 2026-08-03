import { render, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import posthog from 'posthog-js'
import PostHogUserProvider from './posthog-user-provider'

vi.mock('@/hooks/session', () => ({
    useSession: vi.fn(),
}))
import { useSession } from '@/hooks/session'

const mockUseSession = useSession as Mock

describe('PostHogUserProvider', () => {
    it('identifies the user once the session loads', () => {
        const identifySpy = vi.spyOn(posthog, 'identify').mockImplementation(() => posthog)
        mockUseSession.mockReturnValue({ isLoaded: true, session: { user: { id: 'user-123' } } })

        render(<PostHogUserProvider />)

        expect(identifySpy).toHaveBeenCalledWith('user-123')
    })

    it('does not identify before the session is loaded', () => {
        const identifySpy = vi.spyOn(posthog, 'identify').mockImplementation(() => posthog)
        mockUseSession.mockReturnValue({ isLoaded: false, session: null })

        render(<PostHogUserProvider />)

        expect(identifySpy).not.toHaveBeenCalled()
    })
})
