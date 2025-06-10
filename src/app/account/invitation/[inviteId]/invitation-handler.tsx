'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { AccountPanel } from './account-form'
import { acceptInviteForExistingUserAction } from './invite.actions'
import { LoadingMessage } from '@/components/loading'
import { SuccessPanel } from '@/components/panel'
import { reportError } from '@/components/errors'
import { useDashboardUrl } from '@/lib/dashboard-url'

interface InvitationHandlerProps {
    inviteId: string
    invitedEmail: string
}

export function InvitationHandler({ inviteId, invitedEmail }: InvitationHandlerProps) {
    const { isLoaded, isSignedIn } = useAuth()
    const router = useRouter()
    const [isLoadingAction, setIsLoadingAction] = useState(false)
    const [orgName, setOrgName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    // use dynamic dashboard resolution
    const dashboardUrl = useDashboardUrl()

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            setIsLoadingAction(true)
            acceptInviteForExistingUserAction({ inviteId })
                .then((result) => {
                    if (result.success && result.organizationName) {
                        setOrgName(result.organizationName)
                        // The success message is now part of the SuccessPanel
                    } else {
                        setError(result.error || 'Failed to accept invitation.')
                        notifications.show({
                            title: 'Error',
                            message: result.error || 'Could not process your invitation.',
                            color: 'red',
                        })
                    }
                })
                .catch((err) => {
                    reportError(err, 'Error accepting invitation for existing user')
                    setError('An unexpected error occurred while processing your invitation.')
                    notifications.show({
                        title: 'Error',
                        message: 'An unexpected error occurred.',
                        color: 'red',
                    })
                })
                .finally(() => {
                    setIsLoadingAction(false)
                })
        }
    }, [isLoaded, isSignedIn, inviteId])

    if (!isLoaded || (isSignedIn && isLoadingAction)) {
        return <LoadingMessage message="Processing your invitation..." />
    }

    if (isSignedIn) {
        if (error) {
            return <Text color="red">{error}</Text>
        }
        if (orgName) {
            return (
                <SuccessPanel title={`You're now a member of ${orgName}!`} onContinue={() => router.push(dashboardUrl)}>
                    Visit your dashboard to get started.
                </SuccessPanel>
            )
        }
        // This state should be brief, while waiting for orgName
        return <LoadingMessage message="Finalizing your membership..." />
    }

    // Not signed in, show the account creation panel
    return <AccountPanel inviteId={inviteId} email={invitedEmail} />
}
