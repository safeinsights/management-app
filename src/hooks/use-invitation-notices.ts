'use client'

import { notifications } from '@mantine/notifications'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import type { Route } from 'next'

/**
 * Handles invitation-related URL params (skip, decline) and shows notifications.
 * Cleans up the URL params after showing notifications.
 */
export function useInvitationNotices() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()

    const skippedOrg = searchParams.get('skip')
    const declinedOrg = searchParams.get('decline')

    useEffect(() => {
        if (!skippedOrg && !declinedOrg) return

        if (skippedOrg) {
            notifications.show({
                id: 'skip-invitation',
                color: 'green',
                message: `You have opted to skip the invitation to ${skippedOrg}. The invitation can be found in your inbox and is valid for 7 days.`,
            })
        }
        if (declinedOrg) {
            notifications.show({
                id: 'decline-invitation',
                color: 'green',
                message: `You've declined ${declinedOrg}'s invitation.`,
            })
        }

        const params = new URLSearchParams(searchParams.toString())
        params.delete('skip')
        params.delete('decline')
        router.replace(`${pathname}?${params.toString()}` as Route)
    }, [skippedOrg, declinedOrg, pathname, searchParams, router])
}
