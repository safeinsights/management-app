import { notifications } from '@mantine/notifications'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    // The suite-wide afterAll closes the database pool, which never settles while timers are faked.
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns only toasts raised longer ago than the grace period', () => {
        vi.useFakeTimers()
        showToast({ category: 'info', id: 'old', title: 'Old' })
        vi.advanceTimersByTime(5_000)
        showToast({ category: 'info', id: 'young', title: 'Young' })

        const raised = vi.mocked(notifications.show).mock.calls.map(([notification]) => notification)
        const notToast = { id: 'stranger', message: 'Raised without showToast' }

        expect(staleToastIds([...raised, notToast], 3_000)).toEqual(['old'])
    })
})
