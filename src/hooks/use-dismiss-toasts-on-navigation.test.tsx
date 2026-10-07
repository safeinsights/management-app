import { vi } from 'vitest'
import { notifications, notificationsStore } from '@mantine/notifications'
import { showSystemNotification } from '@/components/system-notifications'
import { showToast } from '@/components/toast-notifications'
import { Routes } from '@/lib/routes'
import { act, afterEach, beforeEach, describe, expect, it, mockPathname, renderHook } from '@/tests/unit.helpers'
import { TOAST_NAVIGATION_GRACE_MS, useDismissToastsOnNavigation } from './use-dismiss-toasts-on-navigation'

// The sweep reads ownership and age off the records Mantine keeps, so it runs against the real store.
vi.unmock('@mantine/notifications')

const liveIds = () => {
    const { notifications: shown, queue } = notificationsStore.getState()
    return [...shown, ...queue].map(({ id }) => id)
}

const raiseToast = (id: string) => showToast({ category: 'info', title: 'Draft saved', id })

const mountOn = (pathname: string) => {
    mockPathname(pathname)
    return renderHook(() => useDismissToastsOnNavigation())
}

const navigateTo = (pathname: string) => act(() => mockPathname(pathname))

describe('useDismissToastsOnNavigation', () => {
    beforeEach(() => {
        notifications.clean()
        vi.useFakeTimers()
    })

    // The suite-wide afterAll closes the database pool, which never settles while timers are faked.
    afterEach(() => {
        vi.useRealTimers()
    })

    it('dismisses a toast older than the grace period when the pathname changes', () => {
        raiseToast('aged')
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(liveIds()).not.toContain('aged')
    })

    it('spares a toast inside the grace period until a later change finds it stale', () => {
        raiseToast('young')
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS - 500)
        navigateTo(Routes.accountKeys)
        expect(liveIds()).toContain('young')

        vi.advanceTimersByTime(600)
        navigateTo(Routes.dashboard)
        expect(liveIds()).not.toContain('young')
    })

    it('restarts the grace period when the same toast fires again', () => {
        raiseToast('refired')
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        raiseToast('refired')
        navigateTo(Routes.accountKeys)

        expect(liveIds()).toContain('refired')
    })

    it('dismisses nothing when only the query string changes', () => {
        raiseToast('query-only')
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(`${Routes.dashboard}?tab=studies`)

        expect(liveIds()).toContain('query-only')
    })

    it('leaves a system notification alone, however old', () => {
        showSystemNotification({ id: 'session-expired', message: 'Log back in.' })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(liveIds()).toContain('session-expired')
    })

    // The provider mounts at the root precisely so this works: /account/** and the AppShell routes
    // are sibling layout subtrees, and a provider inside either would remount on the crossing and
    // read it as a first paint rather than a route change.
    it('judges a toast carried across a layout boundary by age alone', () => {
        mountOn(Routes.accountKeys)

        raiseToast('carried-aged')
        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        raiseToast('carried-fresh')

        navigateTo(Routes.dashboard)

        expect(liveIds()).not.toContain('carried-aged')
        expect(liveIds()).toContain('carried-fresh')
    })

    // A toast over the display limit waits in the queue rather than the visible list.
    it('dismisses a stale toast still waiting in the queue', () => {
        const { limit } = notificationsStore.getState()
        Array.from({ length: limit }, (_, i) => raiseToast(`visible-${i}`))
        raiseToast('queued')
        expect(notificationsStore.getState().queue.map(({ id }) => id)).toEqual(['queued'])
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(liveIds()).toEqual([])
    })

    // The outputs-decision notice shares its id with the toast it replaces, and its reload control
    // has to stay until the reviewer presses it.
    it('spares a notice that took over a toast id', () => {
        raiseToast('shared-id')
        showSystemNotification({ id: 'shared-id', message: 'Reload to continue' })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(liveIds()).toContain('shared-id')
    })
})
