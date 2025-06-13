'use client'

/**
 * InvitationHandler is the main component for the invitation acceptance flow.
 * It acts as a state machine to determine which component to render based on the user's authentication status
 * and whether they already have an account with SafeInsights.
 *
 * State Logic:
 * 1. Loading: Shows a loading message while checking auth state.
 * 2. Existing User, Logged Out: Renders the <SignIn /> component.
 * 3. Existing User, Logged In: Automatically calls `claimInviteAction` and shows a success/error message.
 * 4. New User: Renders the <NewUserAccountForm /> for account creation.
 *
 * It also uses localStorage to persist the invite ID across different parts of the sign-up/sign-in flow,
 * especially with MFA required.
 */
import { useState, useEffect } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { userExistsAction } from '@/server/actions/user.actions'
import { SignIn } from '@/app/account/signin/signin'
import { useRouter } from 'next/navigation'
import { Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { NewUserAccountForm } from './new-user-account-form'
import { claimInviteAction } from '@/server/actions/invite.actions'
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
    const { setActive } = useClerk()
    const { user } = useUser()
    const router = useRouter()
    const [isLoadingAction, setIsLoadingAction] = useState(false)
    const [newOrgSlug, setNewOrgSlug] = useState<string | null>(null)
    const [orgName, setOrgName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    // use dynamic dashboard resolution
    const dashboardUrl = useDashboardUrl()

    // remember the inviteId so that once they sign in we auto-claim
    useEffect(() => {
        window.localStorage.setItem('pendingInviteId', inviteId)
    }, [inviteId])

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            setIsLoadingAction(true)
            claimInviteAction({ inviteId })
                .then((result) => {
                    if (result.success && result.organizationName) {
                        setOrgName(result.organizationName)
                        setNewOrgSlug(result.orgSlug || null)
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
                .finally(() => setIsLoadingAction(false))
        }
    }, [isLoaded, isSignedIn, inviteId])

    useEffect(() => {
        if (!newOrgSlug || !user) return

        const orgMeta = user.publicMetadata?.orgs?.find((o) => o.slug === newOrgSlug)
        if (orgMeta?.isReviewer) {
            // update Clerk’s active organization so useDashboardUrl picks it up
            setActive({ organization: newOrgSlug }).catch(() => {})
        }
    }, [newOrgSlug, user, setActive])

    // fetch whether this email is already in our SI user table
    const { data: userExists } = useQuery({
        queryKey: ['userExists', invitedEmail],
        queryFn: () => userExistsAction(invitedEmail),
        enabled: isLoaded,
    })

    if (!isLoaded || isLoadingAction) {
        return <LoadingMessage message="Processing your invitation..." />
    }

    // returning user: prompt them to sign in instead of sign up
    if (userExists && !isSignedIn) {
        return <SignIn />
    }

    if (isSignedIn) {
        if (error) {
            return <Text color="red">{error}</Text>
        }
        if (orgName) {
            return (
                <SuccessPanel title={`You're now a member of ${orgName}!`} onContinue={() => router.push(dashboardUrl)}>
                    Visit your dashboard
                </SuccessPanel>
            )
        }
        // This state should be brief, while waiting for orgName
        return <LoadingMessage message="Finalizing your membership..." />
    }

    // first‐time SI users get our old sign‐up + MFA flow
    return <NewUserAccountForm inviteId={inviteId} email={invitedEmail} />
}
