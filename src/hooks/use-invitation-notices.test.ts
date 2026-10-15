import { notifications } from '@mantine/notifications'
import { describe, expect, it, mockPathname, renderHook } from '@/tests/unit.helpers'
import { useInvitationNotices } from '@/hooks/use-invitation-notices'
import { INVITATION_NOTICE_STORAGE_KEY, markInvitationNotice } from '@/lib/invitation-notice'
import { Routes } from '@/lib/routes'

describe('useInvitationNotices', () => {
    it('raises the skip toast once', () => {
        markInvitationNotice({ kind: 'skip', orgName: 'Test Org' })

        renderHook(() => useInvitationNotices())

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'skip-invitation',
                title: 'You have opted to skip the invitation to Test Org. The invitation can be found in your inbox and is valid for 7 days.',
            }),
        )
        expect(sessionStorage.getItem(INVITATION_NOTICE_STORAGE_KEY)).toBeNull()
    })

    it('raises the decline toast once', () => {
        markInvitationNotice({ kind: 'decline', orgName: 'Test Org' })

        renderHook(() => useInvitationNotices())

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'decline-invitation', title: "You've declined Test Org's invitation." }),
        )
        expect(sessionStorage.getItem(INVITATION_NOTICE_STORAGE_KEY)).toBeNull()
    })

    it('does not raise the toast again on a later mount', () => {
        markInvitationNotice({ kind: 'skip', orgName: 'Test Org' })
        renderHook(() => useInvitationNotices()).unmount()

        renderHook(() => useInvitationNotices())

        expect(notifications.show).toHaveBeenCalledTimes(1)
    })

    it('ignores invitation params in the URL', () => {
        mockPathname(`${Routes.dashboard}?skip=Any%20Org&decline=Any%20Lab`)

        renderHook(() => useInvitationNotices())

        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('ignores a malformed stored notice', () => {
        sessionStorage.setItem(INVITATION_NOTICE_STORAGE_KEY, JSON.stringify({ kind: 'other', orgName: 'Test Org' }))

        renderHook(() => useInvitationNotices())

        expect(notifications.show).not.toHaveBeenCalled()
        expect(sessionStorage.getItem(INVITATION_NOTICE_STORAGE_KEY)).toBeNull()
    })
})
