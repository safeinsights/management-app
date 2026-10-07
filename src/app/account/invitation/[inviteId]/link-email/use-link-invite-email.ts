'use client'

import { useForm, useQuery } from '@/common'
import { errorToString, extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { markOrgJoined } from '@/lib/joined-org'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { useReverification, useUser } from '@clerk/nextjs'
import type { EmailAddressResource, UserResource } from '@clerk/types'
import { isNotEmpty } from '@mantine/form'
import { captureException } from '@sentry/nextjs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getClaimedInviteAction } from '../create-account.action'

export type LinkInviteEmailStatus = 'loading' | 'awaiting-code' | 'verifying' | 'failed'

type AddEmailAddress = (owner: UserResource, email: string) => Promise<EmailAddressResource>

// Matches the cooldown Clerk's own components enforce; the code already sent stays valid for 10 minutes.
const RESEND_INTERVAL_MS = 30_000
const RESEND_THROTTLED_MESSAGE = 'A code was just sent. Please wait 30 seconds before requesting another.'

const isRateLimited = (error: unknown) =>
    isClerkApiError(error) &&
    ['too_many_requests', 'verification_code_too_many_requests'].includes(extractClerkCodeAndMessage(error).code)

const matchingAddress = (user: UserResource, email: string) =>
    user.emailAddresses.find((address) => address.emailAddress.toLowerCase() === email.toLowerCase())

const isVerified = (address: EmailAddressResource | undefined) => address?.verification?.status === 'verified'

export function useLinkInviteEmail(inviteId: string) {
    const router = useRouter()
    const { user } = useUser()

    // Clerk protects adding an address behind reverification on a window shorter than the key
    // detour that can precede this screen, so the challenge has to be able to interrupt the call.
    const addEmailAddress: AddEmailAddress = useReverification((owner: UserResource, email: string) =>
        owner.createEmailAddress({ email }),
    )

    const [status, setStatus] = useState<LinkInviteEmailStatus>('loading')
    const [isSending, setIsSending] = useState(false)
    const pendingAddress = useRef<EmailAddressResource | null>(null)
    const lastSentAt = useRef(0)
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

    // The screen shows one generic message for every failure, so the cause goes to Sentry instead.
    const reportFailure = useCallback((error: unknown) => {
        captureException(error)
        setStatus('failed')
    }, [])

    // The address is kept as soon as Clerk returns it, so a failed send still leaves "Try again"
    // an entry to reuse and "Skip for now" an entry to discard. Reusing an entry Clerk kept from an
    // abandoned visit also stops a second visit colliding with the caller's own pending address.
    const sendCode = useCallback(
        async (owner: UserResource, email: string) => {
            if (!pendingAddress.current) {
                pendingAddress.current = matchingAddress(owner, email) ?? (await addEmailAddress(owner, email))
            }
            await pendingAddress.current.prepareVerification({ strategy: 'email_code' })
            lastSentAt.current = Date.now()
        },
        [addEmailAddress],
    )

    useEffect(() => {
        if (!invite || !user || hasStarted.current) return
        hasStarted.current = true

        if (isVerified(matchingAddress(user, invite.email))) {
            router.push(Routes.orgDashboard({ orgSlug: invite.orgSlug }))
            return
        }

        sendCode(user, invite.email).then(() => setStatus('awaiting-code'), reportFailure)
    }, [invite, user, router, sendCode, reportFailure])

    const resendCode = useCallback(async () => {
        if (!invite || !user) return
        if (Date.now() - lastSentAt.current < RESEND_INTERVAL_MS) {
            form.setFieldError('code', RESEND_THROTTLED_MESSAGE)
            return
        }
        form.clearFieldError('code')
        setIsSending(true)
        try {
            await sendCode(user, invite.email)
            setStatus('awaiting-code')
        } catch (error) {
            // A code sent earlier is still in the inbox, so keep the person on the code form.
            if (lastSentAt.current && isRateLimited(error)) {
                form.setFieldError('code', RESEND_THROTTLED_MESSAGE)
                setStatus('awaiting-code')
                return
            }
            reportFailure(error)
        } finally {
            setIsSending(false)
        }
    }, [invite, user, form, sendCode, reportFailure])

    const verify = useCallback(
        async ({ code }: { code: string }) => {
            const address = pendingAddress.current
            if (!invite || !user || !address) return
            setStatus('verifying')
            try {
                await address.attemptVerification({ code })
                // The link is done once Clerk accepts the code; a failed refresh must not hold them here.
                await user.reload().catch(() => {})
                // Overwrites the flag the accept step set, so the dashboard banner names the
                // address that was linked rather than the plain "added to" copy.
                markOrgJoined(invite.orgName, invite.email)
                router.push(Routes.orgDashboard({ orgSlug: invite.orgSlug }))
            } catch (error) {
                form.setErrors({
                    code: errorToString(error, {
                        clerkOverrides: { form_code_incorrect: 'Invalid verification code. Please try again.' },
                    }),
                })
                setStatus('awaiting-code')
            }
        },
        [invite, user, router, form],
    )

    const skip = useCallback(async () => {
        // Another tab may have verified the address since this one loaded, so ask Clerk before
        // discarding it. Discarding is hygiene only: Clerk's user lookup ignores unverified entries.
        const address = await pendingAddress.current?.reload().catch(() => null)
        if (address && !isVerified(address)) {
            await address.destroy().catch(() => {})
        }
        leave()
    }, [leave])

    return {
        status: isLoading ? ('loading' as const) : status,
        isSending,
        isInviteInvalid: isError,
        invitedEmail: invite?.email ?? '',
        orgName: invite?.orgName ?? '',
        form,
        verify,
        resendCode,
        skip,
    }
}
