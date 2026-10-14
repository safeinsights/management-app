'use client'

import { showToast } from '@/components/toast-notifications'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

function stripInvitationParams() {
    const url = new URL(window.location.href)
    url.searchParams.delete('skip')
    url.searchParams.delete('decline')
    window.history.replaceState(null, '', url)
}

export function useInvitationNotices() {
    const searchParams = useSearchParams()

    const skippedOrg = searchParams.get('skip')
    const declinedOrg = searchParams.get('decline')

    useEffect(() => {
        if (!skippedOrg && !declinedOrg) return

        if (skippedOrg) {
            showToast({
                category: 'success',
                id: 'skip-invitation',
                title: `You have opted to skip the invitation to ${skippedOrg}. The invitation can be found in your inbox and is valid for 7 days.`,
            })
        }
        if (declinedOrg) {
            showToast({
                category: 'success',
                id: 'decline-invitation',
                title: `You've declined ${declinedOrg}'s invitation.`,
            })
        }

        // Native history, not router.replace: that refetches this force-dynamic page and can be
        // dropped before it commits. Deferred until Next has patched it (vercel/next.js#72322).
        const timer = setTimeout(stripInvitationParams, 0)
        return () => clearTimeout(timer)
    }, [skippedOrg, declinedOrg])
}
