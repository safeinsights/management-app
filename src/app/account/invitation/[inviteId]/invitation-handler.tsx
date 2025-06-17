'use client'

/**
 * InvitationHandler is the main component for the invitation acceptance flow.
 * It acts as a state machine to determine which component to render based on the user's authentication status
 * and whether they already have an account with SafeInsights.
 *
 * State Logic:
 * 1. Loading: Shows a loading message while checking auth state.
 * 2. Existing User, Logged In: Automatically calls `claimInviteAction` and shows a success/error message.
 * 3. New User: Renders the <NewUserAccountForm /> for account creation.
 *
 * It also uses localStorage to persist the invite ID across different parts of the sign-up/sign-in flow,
 * especially with MFA required.
 */
import { useState, useEffect } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from '@tanstack/react-query'
import { userExistsForInviteAction } from '@/server/actions/user.actions'
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
    interface InvitationState {
        newOrgSlug: string | null
        orgName: string | null
        error: string | null
    }

    const [state, setState] = useState<InvitationState>({
        newOrgSlug: null,
        orgName: null,
        error: null,
    })
    // use dynamic dashboard resolution
    const dashboardUrl = useDashboardUrl()

    const { mutate, isPending } = useMutation({
        mutationFn: claimInviteAction,
        onSuccess: (result) => {
            if (result.success && result.organizationName) {
                setState({
                    orgName: result.organizationName,
                    newOrgSlug: result.orgSlug || null,
                    error: null,
                })
            } else {
                const error = result.error || 'Failed to accept invitation.'
                setState({ orgName: null, newOrgSlug: null, error })
                notifications.show({ title: 'Error', message: error, color: 'red' })
            }
        },
        onError: (err) => {
            const error = 'An unexpected error occurred while processing your invitation.'
            reportError(err, 'Error accepting invitation for existing user')
            setState({ orgName: null, newOrgSlug: null, error })
            notifications.show({ title: 'Error', message: 'An unexpected error occurred.', color: 'red' })
        },
    })

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            mutate({ inviteId })
        }
    }, [isLoaded, isSignedIn, inviteId, mutate])

    useEffect(() => {
        if (!state.newOrgSlug || !user) return

        const orgMeta = user.publicMetadata?.orgs?.find((o) => o.slug === state.newOrgSlug)
        if (orgMeta?.isReviewer) {
            // update Clerk’s active organization so useDashboardUrl picks it up
            setActive({ organization: state.newOrgSlug }).catch(() => {})
        }
    }, [state.newOrgSlug, user, setActive])

    // fetch whether this email is already in our SI user table
    const { data: userExists } = useQuery({
        queryKey: ['userExistsForInvite', inviteId],
        queryFn: () => userExistsForInviteAction(inviteId),
        enabled: isLoaded,
    })

    useEffect(() => {
        if (userExists && !isSignedIn) {
            router.replace(`/account/signin?inviteId=${inviteId}`)
        }
    }, [userExists, isSignedIn, router, inviteId])

    if (!isLoaded || isPending) {
        return <LoadingMessage message="Processing your invitation..." />
    }

    // returning user: prompt them to sign in instead of sign up
    if (userExists && !isSignedIn) {
        return <LoadingMessage message="Redirecting to sign-in…" />
    }

    if (isSignedIn) {
        if (state.error) {
            return <Text color="red">{state.error}</Text>
        }
        if (state.orgName) {
            return (
                <SuccessPanel
                    title={`You're now a member of ${state.orgName}!`}
                    onContinue={() => router.push(dashboardUrl)}
                >
                    Visit your dashboard
                </SuccessPanel>
            )
        }
        // This state should be brief, while waiting for orgName
        return <LoadingMessage message="Finalizing your membership..." />
    }

    // first‐time SI users get our new sign‐up + MFA flow
    return <NewUserAccountForm inviteId={inviteId} email={invitedEmail} />
}
