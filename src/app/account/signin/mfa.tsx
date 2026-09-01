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

// A stale token matters less than losing the invite or key detour that follows, so a refresh
// failure is logged, not thrown.
async function refreshSessionToken(getToken: GetToken, caller: 'sign-in' | 'invite-accepted') {
    try {
        await getToken({ skipCache: true })
    } catch (error) {
        console.error(`session token refresh failed after ${caller}:`, error)
    }
}

// The session is already established, so a failure here must not abort the rest of the sequence.
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

// Always resolves to a destination rather than throwing, so the key detour still runs on top.
async function acceptInviteAndResolveLanding(inviteId: string, getToken: GetToken): Promise<Route> {
    const joinTeamPage = Routes.accountInvitationJoinTeam({ inviteId }) as Route

    let org: { slug: string; name: string }
    try {
        // Read before joining: the lookup only resolves unclaimed invites.
        org = actionResult(await getOrgInfoForInviteAction({ inviteId }))
    } catch (error) {
        // Retrying can never succeed, and the join-team page has a persistent "no longer valid"
        // panel where a dashboard would only flash a toast.
        reportError(error, 'This invitation is no longer valid')
        return joinTeamPage
    }

    try {
        // actionResult despite the discarded value: it turns an action failure into a throw.
        actionResult(await onJoinTeamAccountAction({ inviteId }))
    } catch (error) {
        // A failed join rolls the claim back, leaving the invite live, so return where Accept can
        // be retried.
        reportError(error, 'Failed to accept your invitation. Please try again.')
        return joinTeamPage
    }

    markOrgJoined(org.name)
    // After the landing is settled: nothing past this point may turn a successful join into a
    // retry prompt.
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
                    // An invite outranks redirect_url: a deep link captured before the join may
                    // still be unreachable to this account.
                    if (inviteId) {
                        redirectUrl = await acceptInviteAndResolveLanding(inviteId, auth.getToken)
                    }

                    // Key generation last, so a keyless user still accepts their invite on the way
                    // through (OTTER-655).
                    router.push(
                        result?.redirectToKeyGeneration
                            ? keyGenerationUrl(redirectUrl)
                            : (redirectUrl ?? Routes.dashboard),
                    )
                } catch (error) {
                    // Both steps above resolve their own failures, so reaching this means something
                    // unexpected threw. The user is signed in either way.
                    console.error('post sign-in navigation failed:', error)
                    router.push(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
                }
            } else {
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
            form.setFieldValue('code', '')
            form.clearErrors()
        }
    }

    // Clerk masks the phone number during MFA sign-in.
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
