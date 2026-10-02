import { notifications, notificationsStore, type NotificationsState } from '@mantine/notifications'
import { showOrReplaceNotification } from '@/components/errors'
import { showToast } from '@/components/toast-notifications'
import { Routes } from '@/lib/routes'
import { act, afterEach, beforeEach, describe, expect, it, mockPathname, renderHook, vi } from '@/tests/unit.helpers'
import { TOAST_NAVIGATION_GRACE_MS, useDismissToastsOnNavigation } from './use-dismiss-toasts-on-navigation'

const liveToasts = ({ shown = [], queued = [] }: { shown?: string[]; queued?: string[] }) => {
    const state: NotificationsState = {
        notifications: shown.map((id) => ({ id, message: '' })),
        queue: queued.map((id) => ({ id, message: '' })),
        defaultPosition: 'top-right',
        limit: 3,
    }
    vi.mocked(notificationsStore.getState).mockReturnValue(state)
}

const raiseToast = (id: string) => showToast({ category: 'info', title: 'Draft saved', id })

const mountOn = (pathname: string) => {
    mockPathname(pathname)
    return renderHook(() => useDismissToastsOnNavigation())
}

const navigateTo = (pathname: string) => act(() => mockPathname(pathname))

describe('useDismissToastsOnNavigation', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    // The suite-wide afterAll closes the database pool, which never settles while timers are faked.
    afterEach(() => {
        vi.useRealTimers()
    })

    it('dismisses a toast older than the grace period when the pathname changes', () => {
        raiseToast('aged')
        liveToasts({ shown: ['aged'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(notifications.hide).toHaveBeenCalledWith('aged')
    })

    it('spares a toast inside the grace period until a later change finds it stale', () => {
        raiseToast('young')
        liveToasts({ shown: ['young'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS - 500)
        navigateTo(Routes.accountKeys)
        expect(notifications.hide).not.toHaveBeenCalled()

        vi.advanceTimersByTime(600)
        navigateTo(Routes.dashboard)
        expect(notifications.hide).toHaveBeenCalledWith('young')
    })

    it('dismisses nothing when only the query string changes', () => {
        raiseToast('query-only')
        liveToasts({ shown: ['query-only'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(`${Routes.dashboard}?tab=studies`)

        expect(notifications.hide).not.toHaveBeenCalled()
    })

    it('leaves a notification it never raised alone, however old', () => {
        liveToasts({ shown: ['system-notification'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(notifications.hide).not.toHaveBeenCalled()
    })

    // The provider mounts at the root precisely so this works: /account/** and the AppShell routes
    // are sibling layout subtrees, and a provider inside either would remount on the crossing and
    // read it as a first paint rather than a route change.
    it('judges a toast carried across a layout boundary by age alone', () => {
        liveToasts({ shown: ['carried-aged', 'carried-fresh'] })
        mountOn(Routes.accountKeys)

        raiseToast('carried-aged')
        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        raiseToast('carried-fresh')

        navigateTo(Routes.dashboard)

        expect(notifications.hide).toHaveBeenCalledWith('carried-aged')
        expect(notifications.hide).not.toHaveBeenCalledWith('carried-fresh')
    })

    // A toast over the display limit waits in the queue rather than the visible list. Judging
    // liveness by the visible list alone would forget it, and nothing would ever dismiss it.
    it('dismisses a stale toast still waiting in the queue', () => {
        raiseToast('queued')
        liveToasts({ queued: ['queued'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(notifications.hide).toHaveBeenCalledWith('queued')
    })

    // The outputs-decision notice shares its id with the toast it replaces, and its reload control
    // has to stay until the reviewer presses it.
    it('spares a notice a non-toast path took over from showToast', () => {
        raiseToast('shared-id')
        showOrReplaceNotification({ id: 'shared-id', autoClose: false, message: 'Reload to continue' })
        liveToasts({ shown: ['shared-id'] })
        mountOn(Routes.dashboard)

        vi.advanceTimersByTime(TOAST_NAVIGATION_GRACE_MS + 1)
        navigateTo(Routes.accountKeys)

        expect(notifications.hide).not.toHaveBeenCalled()
    })
})
