'use client'

import { showToast } from '@/components/toast-notifications'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import type { Route } from 'next'

export function useInvitationNotices() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()

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

        const params = new URLSearchParams(searchParams.toString())
        params.delete('skip')
        params.delete('decline')
        router.replace(`${pathname}?${params.toString()}` as Route)
    }, [skippedOrg, declinedOrg, pathname, searchParams, router])
}
