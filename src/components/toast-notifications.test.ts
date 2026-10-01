import { notifications } from '@mantine/notifications'
import { describe, expect, it, vi } from 'vitest'
import { showToast, staleToastIds } from './toast-notifications'

describe('showToast', () => {
    it('gives each category its own colour, timeout and role', () => {
        showToast({ category: 'success', title: 'Saved' })
        expect(notifications.show).toHaveBeenLastCalledWith(
            expect.objectContaining({ color: 'green', autoClose: 4_000, role: 'status', 'data-toast-kind': 'success' }),
        )

        showToast({ category: 'error', title: 'Failed' })
        expect(notifications.show).toHaveBeenLastCalledWith(
            expect.objectContaining({ color: 'red', autoClose: false, role: 'alert', 'aria-live': 'assertive' }),
        )
    })

    it('updates in place rather than stacking when the same content fires twice', () => {
        vi.mocked(notifications.update).mockClear()
        showToast({ category: 'info', title: 'Same', message: 'Body' })
        showToast({ category: 'info', title: 'Same', message: 'Body' })

        const [first, second] = vi.mocked(notifications.update).mock.calls
        expect(first[0].id).toEqual(second[0].id)
    })

    it('lets an explicit id carry changing copy under one toast', () => {
        showToast({ category: 'error', id: 'fixed', title: 'One' })
        showToast({ category: 'error', id: 'fixed', title: 'Two' })
        expect(notifications.show).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fixed', title: 'Two' }))
    })
})

describe('staleToastIds', () => {
    it('returns only ids it raised, older than the grace period', () => {
        vi.useFakeTimers()
        showToast({ category: 'info', id: 'old', title: 'Old' })
        vi.advanceTimersByTime(5_000)
        showToast({ category: 'info', id: 'young', title: 'Young' })

        // 'stranger' was never raised through showToast: a system notification.
        expect(staleToastIds(['old', 'young', 'stranger'], 3_000)).toEqual(['old'])
        vi.useRealTimers()
    })

    it('forgets an id that has left the store entirely', () => {
        showToast({ category: 'info', id: 'gone', title: 'Gone' })
        staleToastIds([], 3_000) // Mantine closed it on its own timer.
        expect(staleToastIds([], 3_000, Date.now() + 10_000)).toEqual([])
    })

    it('keeps a queued toast, which is live but not visible', () => {
        showToast({ category: 'info', id: 'queued', title: 'Queued' })
        // The caller must pass notifications AND queue. Passing only the visible list here would
        // forget the toast and leave it permanently undismissable.
        const liveIncludingQueue = ['queued']
        staleToastIds(liveIncludingQueue, 3_000)
        expect(staleToastIds(liveIncludingQueue, 3_000, Date.now() + 10_000)).toEqual(['queued'])
    })
})
