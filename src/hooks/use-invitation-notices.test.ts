import { notifications } from '@mantine/notifications'
import { describe, expect, it, mockPathname, renderHook, waitFor } from '@/tests/unit.helpers'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'
import { Routes } from '@/lib/routes'

// The router mock never sees native history calls, so the real URL and the mocked one are set together.
const openDashboard = (query: string) => {
    const url = `${Routes.dashboard}${query}`
    window.history.replaceState(null, '', url)
    mockPathname(url)
    return renderHook(() => useInvitationNotices())
}

const currentUrl = () => `${window.location.pathname}${window.location.search}`

describe('useInvitationNotices', () => {
    it('raises the skip toast and clears the param', async () => {
        openDashboard('?skip=Test%20Org')

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'skip-invitation',
                title: 'You have opted to skip the invitation to Test Org. The invitation can be found in your inbox and is valid for 7 days.',
            }),
        )
        // Stripping in the effect itself would race Next's history patching (vercel/next.js#72322).
        expect(currentUrl()).toBe(`${Routes.dashboard}?skip=Test%20Org`)
        await waitFor(() => expect(currentUrl()).toBe(Routes.dashboard))
    })

    it('raises the decline toast and clears the param', async () => {
        openDashboard('?decline=Test%20Org')

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'decline-invitation', title: "You've declined Test Org's invitation." }),
        )
        await waitFor(() => expect(currentUrl()).toBe(Routes.dashboard))
    })

    it('keeps unrelated params', async () => {
        openDashboard('?skip=Test%20Org&audience=researcher')

        await waitFor(() => expect(currentUrl()).toBe(`${Routes.dashboard}?audience=researcher`))
    })

    it('raises both toasts and clears both params', async () => {
        openDashboard('?skip=Skip%20Org&decline=Decline%20Lab')

        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'skip-invitation' }))
        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ id: 'decline-invitation' }))
        await waitFor(() => expect(currentUrl()).toBe(Routes.dashboard))
    })

    it('does nothing without invitation params', () => {
        openDashboard('?audience=reviewer')

        expect(notifications.show).not.toHaveBeenCalled()
        expect(currentUrl()).toBe(`${Routes.dashboard}?audience=reviewer`)
    })
})
