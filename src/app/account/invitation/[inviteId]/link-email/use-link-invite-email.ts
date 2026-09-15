'use client'

import { useForm, useQuery } from '@/common'
import { errorToString, extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { useReverification, useUser } from '@clerk/nextjs'
import type { EmailAddressResource, UserResource } from '@clerk/types'
import { isNotEmpty } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getClaimedInviteAction } from '../create-account.action'

export type LinkInviteEmailStatus = 'loading' | 'sending' | 'awaiting-code' | 'verifying' | 'unavailable' | 'failed'

const matchingAddress = (user: UserResource, email: string) =>
    user.emailAddresses.find((address) => address.emailAddress.toLowerCase() === email.toLowerCase())

const isVerified = (address: EmailAddressResource | undefined) => address?.verification?.status === 'verified'

// "under" is the address the person signs in with, not the invited one: the invite is what gets
// folded into their existing account (OTTER-345).
const linkedMessage = (accountEmail: string | undefined) =>
    accountEmail
        ? `You’ve successfully linked your SafeInsights accounts under ${accountEmail}.`
        : 'You’ve successfully linked your SafeInsights accounts.'

export function useLinkInviteEmail(inviteId: string) {
    const router = useRouter()
    const { user } = useUser()

    // Clerk protects adding an address behind reverification on a window shorter than the key
    // detour that can precede this screen, so the challenge has to be able to interrupt the call.
    const addEmailAddress = useReverification((owner: UserResource, email: string) =>
        owner.createEmailAddress({ email }),
    )

    const [status, setStatus] = useState<LinkInviteEmailStatus>('loading')
    const [failureMessage, setFailureMessage] = useState<string | null>(null)
    const pendingAddress = useRef<EmailAddressResource | null>(null)
    const hasStarted = useRef(false)

    const form = useForm({
        initialValues: { code: '' },
        validate: { code: isNotEmpty('Required') },
    })

    const {
        data: invite,
        isError,
        isLoading,
    } = useQuery({
        queryKey: ['claimedInvite', inviteId],
        queryFn: async () => actionResult(await getClaimedInviteAction({ inviteId })),
        retry: false,
    })

    const leave = useCallback(() => {
        if (invite) router.push(Routes.orgDashboard({ orgSlug: invite.orgSlug }))
    }, [invite, router])

    const sendCode = useCallback(
        async (existing?: EmailAddressResource) => {
            if (!invite || !user) return
            setStatus('sending')
            setFailureMessage(null)
            try {
                const address = existing ?? (await addEmailAddress(user, invite.email))
                pendingAddress.current = address
                await address.prepareVerification({ strategy: 'email_code' })
                setStatus('awaiting-code')
            } catch (error) {
                // Clerk refuses an address that already belongs to somebody else. Nothing the
                // person can do about it, and the membership they just accepted still stands.
                if (isClerkApiError(error) && extractClerkCodeAndMessage(error).code === 'form_identifier_exists') {
                    setStatus('unavailable')
                    return
                }
                setFailureMessage(errorToString(error))
                setStatus('failed')
            }
        },
        [invite, user, addEmailAddress],
    )

    // Reuses an address Clerk kept from an abandoned attempt, so a second visit does not collide
    // with the caller's own pending entry.
    useEffect(() => {
        if (!invite || !user || hasStarted.current) return
        hasStarted.current = true

        const existing = matchingAddress(user, invite.email)
        if (isVerified(existing)) {
            router.push(Routes.orgDashboard({ orgSlug: invite.orgSlug }))
            return
        }
        void sendCode(existing)
    }, [invite, user, router, sendCode])

    const verify = useCallback(
        async ({ code }: { code: string }) => {
            const address = pendingAddress.current
            if (!invite || !user || !address) return
            setStatus('verifying')
            try {
                await address.attemptVerification({ code })
                await user.reload()
                notifications.show({
                    color: 'green',
                    title: 'Accounts successfully linked',
                    message: linkedMessage(user.primaryEmailAddress?.emailAddress),
                })
                router.push(Routes.orgDashboard({ orgSlug: invite.orgSlug }))
            } catch (error) {
                form.setErrors({
                    code: errorToString(error, {
                        form_code_incorrect: 'Invalid verification code. Please try again.',
                    }),
                })
                setStatus('awaiting-code')
            }
        },
        [invite, user, router, form],
    )

    const skip = useCallback(async () => {
        const address = pendingAddress.current
        // Hygiene rather than a security measure: Clerk's user lookup matches verified addresses
        // only, so an entry left unverified cannot stand in for anybody.
        if (address && !isVerified(address)) {
            await address.destroy().catch(() => {})
        }
        leave()
    }, [leave])

    return {
        status: isLoading ? ('loading' as const) : status,
        isInviteInvalid: isError,
        invitedEmail: invite?.email ?? '',
        orgName: invite?.orgName ?? '',
        failureMessage,
        form,
        verify,
        resendCode: () => sendCode(pendingAddress.current ?? undefined),
        skip,
        continueToOrg: leave,
    }
}
