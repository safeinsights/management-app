'use client'
import { useForm, useMutation } from '@/common'
import { reportError } from '@/components/errors'
import { errorToString } from '@/lib/errors'
import { markOrgJoined } from '@/lib/joined-org'
import { Routes } from '@/lib/routes'
import { actionResult, safeRedirectUrl } from '@/lib/utils'
import { keyGenerationUrl } from '@/lib/user-key-redirect'
import { onUserSignInAction } from '@/server/actions/user.actions'
import { useAuth, useSignIn, useUser } from '@clerk/nextjs'
import type { GetToken, SignInResource } from '@clerk/types'
import { Button, Divider, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { isNotEmpty } from '@mantine/form'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { FC, useState } from 'react'
import { getOrgInfoForInviteAction, onJoinTeamAccountAction } from '../invitation/[inviteId]/create-account.action'
import { MFAState } from './logic'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { VerifyCode } from './verify-code'

export type Step = 'select' | 'verify' | 'recovery'
type Method = 'sms' | 'totp'

// The session token is what carries fresh org metadata to the next page, but a stale token is a
// far smaller problem than losing the invite or the key detour that follows it, so a refresh
// failure is logged rather than thrown. The caller is named in the log because the two differ in
// what the user is left holding: after sign-in nothing has been committed yet, while after an
// invite accept the membership row already exists, so a stale token there means a joined user
// whose session cannot see the org.
async function refreshSessionToken(getToken: GetToken, caller: 'sign-in' | 'invite-accepted') {
    try {
        await getToken({ skipCache: true })
    } catch (error) {
        console.error(`session token refresh failed after ${caller}:`, error)
    }
}

// Clerk has already established the session by the time this runs, so a failure here must not
// abort the rest of the sequence: a pending invite still needs accepting, and the client key guard
// still catches a keyless account wherever it lands.
async function completeServerSignIn(getToken: GetToken) {
    try {
        const result = actionResult(await onUserSignInAction())
        await refreshSessionToken(getToken, 'sign-in')
        return result
    } catch (error) {
        console.error('onUserSignInAction failed:', error)
        return null
    }
}

// Always resolves to a destination rather than throwing, so the key detour still runs on top of
// whatever this decides.
async function acceptInviteAndResolveLanding(inviteId: string, getToken: GetToken): Promise<Route> {
    const joinTeamPage = Routes.accountInvitationJoinTeam({ inviteId }) as Route

    let org: { slug: string; name: string }
    try {
        // Read the org before joining: accepting marks the invite claimed,
        // and the lookup only resolves unclaimed invites.
        org = actionResult(await getOrgInfoForInviteAction({ inviteId }))
    } catch (error) {
        // A claimed or deleted invite, so retrying can never succeed, which is
        // distinct from a join failure that is worth retrying. The join-team
        // page renders a persistent "no longer valid" panel for this state, so
        // land there rather than on a dashboard where only the transient toast
        // explains what happened.
        reportError(error, 'This invitation is no longer valid')
        return joinTeamPage
    }

    try {
        // actionResult, despite the discarded value: it is what turns an
        // action failure into a throw, so the catch below can run.
        actionResult(await onJoinTeamAccountAction({ inviteId }))
    } catch (error) {
        // A join that fails inside its transaction rolls the claim back, leaving the invite live,
        // so return to the join-team page where Accept can be retried instead of silently landing
        // elsewhere.
        reportError(error, 'Failed to accept your invitation. Please try again.')
        return joinTeamPage
    }

    // Same one-shot flag the join-team page sets, so this path lands on
    // the dashboard banner.
    markOrgJoined(org.name)
    // Deliberately after the landing is settled: nothing that runs once the membership exists may
    // turn a successful join into a retry prompt.
    await refreshSessionToken(getToken, 'invite-accepted')

    return Routes.orgDashboard({ orgSlug: org.slug }) as Route
}

export const RequestMFA: FC<{ mfa: MFAState }> = ({ mfa }) => {
    const [step, setStep] = useState<Step>('select')
    const [method, setMethod] = useState<Method | null>(null)
    const { isLoaded, setActive } = useSignIn()
    const router = useRouter()
    const searchParams = useSearchParams()
    const { isSignedIn } = useUser()
    const auth = useAuth()

    // Determine which second-factor strategies are available for this sign-in attempt
    const hasSMS = Boolean(mfa && mfa.signIn.supportedSecondFactors?.some((sf) => sf.strategy === 'phone_code'))
    const hasTOTP = Boolean(mfa && mfa.signIn.supportedSecondFactors?.some((sf) => sf.strategy === 'totp'))
    const hasBoth = Boolean(hasSMS && hasTOTP)
    const hasNoFactors = !hasSMS && !hasTOTP

    const form = useForm({
        initialValues: {
            code: '',
        },

        validate: {
            code: isNotEmpty('Required'),
        },
    })

    const { isPending, mutate: onMFASubmit } = useMutation({
        async mutationFn(form: { code: string }) {
            if (!isLoaded || !mfa) return
            const strategy = method === 'sms' ? 'phone_code' : 'totp'
            return await mfa.signIn.attemptSecondFactor({
                strategy,
                code: form.code,
            })
        },
        onError(error: unknown) {
            form.setErrors({
                code: errorToString(error, {
                    form_code_incorrect: 'Invalid verification code. Please try again.',
                }),
            })
        },
        async onSuccess(signInAttempt?: SignInResource) {
            if (signInAttempt?.status === 'complete' && setActive) {
                await setActive({ session: signInAttempt.createdSessionId })

                try {
                    const result = await completeServerSignIn(auth.getToken)

                    const rawRedirect = searchParams.get('redirect_url')
                    let redirectUrl = rawRedirect ? safeRedirectUrl(rawRedirect, Routes.dashboard) : null
                    const inviteId = searchParams.get('invite_id')
                    // An invite outranks redirect_url when both are present. Joining is the thing
                    // that just changed, and its landing is the only one that reflects it: the
                    // dashboard confirms the membership and carries the joined-org banner, while a
                    // deep link captured before the join may still be unreachable to this account.
                    if (inviteId) {
                        redirectUrl = await acceptInviteAndResolveLanding(inviteId, auth.getToken)
                    }

                    // Key generation last, so a keyless user still accepts their invite on the way
                    // through and resumes where they were headed afterwards (OTTER-655).
                    router.push(
                        result?.redirectToKeyGeneration
                            ? keyGenerationUrl(redirectUrl)
                            : (redirectUrl ?? Routes.dashboard),
                    )
                } catch (error) {
                    // Last resort: both steps above resolve their own failures to a destination,
                    // so reaching this means something unexpected threw. The user is signed in
                    // either way, so navigate rather than stranding them on the MFA form.
                    console.error('post sign-in navigation failed:', error)
                    router.push(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
                }
            } else {
                // clerk did not throw an error but also did not return a signIn object
                form.setErrors({
                    code: `Unknown signIn status: ${signInAttempt?.status || 'unknown'}`,
                })
            }
        },
    })

    const onSelectMethod = async (method: Method) => {
        if (!mfa || !isLoaded) return

        if (mfa.signIn.status === 'needs_second_factor' && method === 'sms') {
            try {
                await mfa.signIn.prepareSecondFactor({ strategy: 'phone_code' })
            } catch (err) {
                console.error('Error preparing second factor', err)
            }
        }

        setMethod(method)
        setStep('verify')
    }

    const resetFlow = async () => {
        if (mfa && mfa.signIn) {
            await mfa.signIn.reload()
            setMethod(null)
            setStep('select')
            // Clear the code input when returning to options
            form.setFieldValue('code', '')
            form.clearErrors()
        }
    }

    // Get phone number from signIn resource if SMS method is selected
    // clerk masks phone number during mfa signin
    const phoneNumber =
        method === 'sms' && mfa
            ? mfa.signIn.supportedSecondFactors?.find((f) => f.strategy === 'phone_code')
            : undefined

    if (isSignedIn || !mfa) return null
    if (!isLoaded) return <Loader />

    return (
        <Paper bg="white" p="xxl" radius="sm" w={500} my={{ base: '1rem', lg: 0 }}>
            {step === 'select' && (
                <Stack mb="xxl">
                    <Title mb="xs" ta="center" order={3}>
                        Multi-Factor Authentication required
                    </Title>
                    <Text size="md" mb="xs">
                        To complete the log in process, please verify your identity using Multi-Factor Authentication
                        (MFA).
                    </Text>
                    {hasNoFactors ? (
                        <>
                            <Text size="sm" c="red.7" mb="xs">
                                No MFA factors are configured for your account. Please contact your administrator to set
                                up MFA, or use a recovery code if you have one.
                            </Text>
                            <Button
                                w="100%"
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                    setStep('recovery')
                                }}
                            >
                                Try recovery code
                            </Button>
                        </>
                    ) : (
                        <>
                            <Stack gap="xl">
                                {hasSMS && (
                                    <Button w="100%" size="lg" variant="primary" onClick={() => onSelectMethod('sms')}>
                                        SMS Verification
                                    </Button>
                                )}
                                {hasTOTP && (
                                    <Button
                                        w="100%"
                                        variant={hasBoth ? 'outline' : 'primary'}
                                        size="lg"
                                        onClick={() => onSelectMethod('totp')}
                                    >
                                        Authenticator app verification
                                    </Button>
                                )}
                            </Stack>
                            <Divider my="xs" c="charcoal.1" />
                            <Text size="md" c="grey.7">
                                Can’t access your MFA device?
                            </Text>
                            <Button
                                w="100%"
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                    setStep('recovery')
                                }}
                            >
                                Try recovery code
                            </Button>
                        </>
                    )}
                </Stack>
            )}

            {step === 'verify' && method && (
                <VerifyCode
                    signIn={mfa.signIn}
                    phoneNumber={phoneNumber ? phoneNumber.safeIdentifier : undefined}
                    form={form}
                    isVerifyingCode={isPending}
                    method={method}
                    onSubmit={onMFASubmit}
                    resetFlow={resetFlow}
                />
            )}

            {step === 'recovery' && <RecoveryCodeSignIn setStep={setStep} />}
        </Paper>
    )
}
