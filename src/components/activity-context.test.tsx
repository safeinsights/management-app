import { INACTIVITY_TIMEOUT_MS, WARNING_THRESHOLD_MS } from '@/lib/types'
import {
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { useClerk, useSession } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { ActivityContext } from './activity-context'
import { showToast, staleToastIds } from './toast-notifications'

const MINUTE_MS = 60 * 1000

const mockSession = (inactiveForMs: number) => {
    const touch = vi.fn().mockResolvedValue({ id: 'refreshed' })
    ;(useSession as Mock).mockReturnValue({
        session: { lastActiveAt: new Date(Date.now() - inactiveForMs), touch },
        isLoaded: true,
        isSignedIn: true,
    })
    ;(useClerk as Mock).mockReturnValue({ signOut: vi.fn().mockResolvedValue(undefined) })
    return { touch }
}

const lastNotification = () => vi.mocked(notifications.show).mock.calls.at(-1)?.[0]

describe('ActivityContext', () => {
    it('warns before expiry with no close button, so the only way out is Stay Signed In', async () => {
        const { touch } = mockSession(INACTIVITY_TIMEOUT_MS - 2 * MINUTE_MS)
        renderWithProviders(<ActivityContext />)

        const warning = lastNotification()
        expect(warning).toMatchObject({ id: 'inactivity-warning', withCloseButton: false, autoClose: false })

        renderWithProviders(<>{warning?.message}</>)
        await userEvent.click(screen.getByRole('button', { name: /stay signed in/i }))

        expect(touch).toHaveBeenCalled()
        await waitFor(() => expect(notifications.hide).toHaveBeenCalledWith('inactivity-warning'))
    })

    it('replaces the warning with a dismissible expiry notice', () => {
        mockSession(INACTIVITY_TIMEOUT_MS + MINUTE_MS)
        renderWithProviders(<ActivityContext />)

        expect(lastNotification()).toMatchObject({ id: 'session-expired', withCloseButton: true, autoClose: false })
        expect(notifications.hide).toHaveBeenCalledWith('inactivity-warning')
    })

    it('clears a stale expiry notice once the session is active again', () => {
        mockSession(WARNING_THRESHOLD_MS - MINUTE_MS)
        renderWithProviders(<ActivityContext />)

        expect(notifications.hide).toHaveBeenCalledWith('session-expired')
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('raises both notices as ids navigation cannot dismiss', () => {
        mockSession(INACTIVITY_TIMEOUT_MS - 2 * MINUTE_MS)
        renderWithProviders(<ActivityContext />)
        mockSession(INACTIVITY_TIMEOUT_MS + MINUTE_MS)
        renderWithProviders(<ActivityContext />)

        // The toast is the control: it proves the sweep ran and still left the session ids alone.
        showToast({ category: 'info', id: 'ordinary-toast', title: 'Heads up' })
        const live = ['inactivity-warning', 'session-expired', 'ordinary-toast']

        expect(staleToastIds(live, 3_000, Date.now() + 10_000)).toEqual(['ordinary-toast'])
    })
})
