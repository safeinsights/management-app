import { notifications } from '@mantine/notifications'
import { describe, expect, it, mockPathname, renderHook, waitFor } from '@/tests/unit.helpers'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'

// The router mock never sees native history calls, so the real URL and the mocked one are set together.
const openDashboard = (url: string) => {
    window.history.replaceState(null, '', url)
    mockPathname(url)
    return renderHook(() => useInvitationNotices())
}

const currentUrl = () => `${window.location.pathname}${window.location.search}`

describe('useInvitationNotices', () => {
    it('raises the skip toast and clears the param', async () => {
        openDashboard('/dashboard?skip=Test%20Org')

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'skip-invitation',
                title: 'You have opted to skip the invitation to Test Org. The invitation can be found in your inbox and is valid for 7 days.',
            }),
        )
        await waitFor(() => expect(currentUrl()).toBe('/dashboard'))
    })

    it('raises the decline toast and clears the param', async () => {
        openDashboard('/dashboard?decline=Test%20Org')

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'decline-invitation', title: "You've declined Test Org's invitation." }),
        )
        await waitFor(() => expect(currentUrl()).toBe('/dashboard'))
    })

    it('keeps unrelated params', async () => {
        openDashboard('/dashboard?skip=Test%20Org&audience=researcher')

        await waitFor(() => expect(currentUrl()).toBe('/dashboard?audience=researcher'))
    })

    it('raises both toasts and clears both params', async () => {
        openDashboard('/dashboard?skip=Skip%20Org&decline=Decline%20Lab')

        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'skip-invitation' }))
        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'decline-invitation' }))
        await waitFor(() => expect(currentUrl()).toBe('/dashboard'))
    })

    it('does nothing without invitation params', () => {
        openDashboard('/dashboard?audience=reviewer')

        expect(notifications.show).not.toHaveBeenCalled()
        expect(currentUrl()).toBe('/dashboard?audience=reviewer')
    })
})
