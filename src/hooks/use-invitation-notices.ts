'use client'

import { showToast } from '@/components/toast-notifications'
import { takeInvitationNotice, type InvitationNotice } from '@/lib/invitation-notice'
import { useEffect } from 'react'

function showInvitationNotice({ kind, orgName }: InvitationNotice) {
    if (kind === 'skip') {
        showToast({
            category: 'success',
            id: 'skip-invitation',
            title: `You have opted to skip the invitation to ${orgName}. The invitation can be found in your inbox and is valid for 7 days.`,
        })
    } else {
        showToast({
            category: 'success',
            id: 'decline-invitation',
            title: `You've declined ${orgName}'s invitation.`,
        })
    }
}

export function useInvitationNotices() {
    useEffect(() => {
        const notice = takeInvitationNotice()
        if (notice) showInvitationNotice(notice)
    }, [])
}
