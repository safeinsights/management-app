import { notifications } from '@mantine/notifications'
import { describe, expect, it, vi } from 'vitest'
import { showSystemNotification } from './system-notifications'
import { showToast, staleToastIds } from './toast-notifications'

describe('showSystemNotification', () => {
    it('never auto-closes, and offers a close button unless told otherwise', () => {
        showSystemNotification({ id: 'session-expired', title: 'Session Expired', message: 'Log back in.' })

        expect(notifications.show).toHaveBeenLastCalledWith(
            expect.objectContaining({ id: 'session-expired', autoClose: false, withCloseButton: true }),
        )
    })

    it("honours a caller's withCloseButton: false", () => {
        showSystemNotification({ id: 'inactivity-warning', message: 'Nearly out of time', withCloseButton: false })

        expect(notifications.show).toHaveBeenLastCalledWith(expect.objectContaining({ withCloseButton: false }))
    })

    it('replaces rather than stacks when the same id fires again', () => {
        showSystemNotification({ id: 'inactivity-warning', message: '2 minutes' })
        showSystemNotification({ id: 'inactivity-warning', message: '1 minute' })

        const [first, second] = vi.mocked(notifications.update).mock.calls
        expect(first[0].id).toEqual(second[0].id)
        expect(second[0].message).toEqual('1 minute')
    })

    it('raises an id the navigation sweep can never dismiss', () => {
        showSystemNotification({ id: 'inactivity-warning', message: 'Nearly out of time' })
        showToast({ category: 'info', id: 'ordinary-toast', title: 'Heads up' })

        // The toast is the control: it proves the sweep ran and still left the system id alone.
        expect(staleToastIds(['inactivity-warning', 'ordinary-toast'], 3_000, Date.now() + 10_000)).toEqual([
            'ordinary-toast',
        ])
    })
})
