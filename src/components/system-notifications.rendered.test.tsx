import { vi } from 'vitest'
import { MantineProvider } from '@mantine/core'
import { Notifications, notifications, notificationsStore } from '@mantine/notifications'
import { beforeEach, describe, expect, it, render, screen, waitFor } from '@/tests/unit.helpers'
import { showSystemNotification } from './system-notifications'
import { showToast, staleToastIds } from './toast-notifications'

// The shared setup swaps this module for spies, and a spy cannot tell an added notification from one
// the store discarded. Only a real store can.
vi.unmock('@mantine/notifications')

const mountNotifications = () =>
    render(
        <MantineProvider>
            <Notifications />
        </MantineProvider>,
    )

describe('showSystemNotification', () => {
    beforeEach(() => {
        notifications.clean()
    })

    it('replaces the text of a notification already on screen under the same id', async () => {
        mountNotifications()

        showSystemNotification({ id: 'shared', message: 'First message' })
        await waitFor(() => expect(screen.getByText('First message')).toBeDefined())

        showSystemNotification({ id: 'shared', message: 'Second message' })

        await waitFor(() => expect(screen.getByText('Second message')).toBeDefined())
        expect(screen.queryByText('First message')).toBeNull()
    })

    it('adds a notification when none is on screen under that id', async () => {
        mountNotifications()

        showSystemNotification({ id: 'fresh', message: 'Only message' })

        await waitFor(() => expect(screen.getByText('Only message')).toBeDefined())
    })

    // `update` shallow-merges, so without an explicit clear the notice would keep the toast's live
    // region and raise time, and the navigation sweep would still dismiss it.
    it('takes over a toast id without inheriting anything that made it a toast', () => {
        showToast({ category: 'error', id: 'shared', title: 'Failed' })
        showSystemNotification({ id: 'shared', message: 'Reload to continue' })

        const [notice] = notificationsStore.getState().notifications
        expect(notice.message).toBe('Reload to continue')
        expect(notice.role).toBeUndefined()
        expect(notice['aria-live']).toBeUndefined()
        expect(notice['data-toast-kind']).toBeUndefined()
        expect(staleToastIds([notice], 0, Date.now() + 10_000)).toEqual([])
    })
})
