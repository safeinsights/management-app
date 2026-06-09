'use client'
import { useUser } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { redirect } from 'next/navigation'
import { ManageMFAView } from './manage-mfa-view'

// Data container: reads the Clerk twoFactorEnabled state and hands it to the
// presentational ManageMFAView via `hasMFA`.
export function ManageMFA() {
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        notifications.show({ message: 'You must be logged in to access this page', color: 'blue' })
        return redirect('/')
    }

    user.reload() // ensure latest twoFactorEnabled state

    const hasMFA = user.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA')

    return <ManageMFAView hasMFA={hasMFA} />
}
