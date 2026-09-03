'use client'
import { useForm, useMutation } from '@/common'
import { errorToString } from '@/lib/errors'
import { useSignIn, useUser } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { Button, Divider, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { isNotEmpty } from '@mantine/form'
import { FC, useState } from 'react'
import { MFAState } from './logic'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { useCompleteSignIn } from './use-complete-sign-in'
import { VerifyCode } from './verify-code'

export type Step = 'select' | 'verify' | 'recovery'
type Method = 'sms' | 'totp'

export const RequestMFA: FC<{ mfa: MFAState }> = ({ mfa }) => {
    const [step, setStep] = useState<Step>('select')
    const [method, setMethod] = useState<Method | null>(null)
    const { isLoaded, setActive } = useSignIn()
    const { isSignedIn } = useUser()
    const completeSignIn = useCompleteSignIn()

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
                await completeSignIn()
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
                                    <Button w="100%" size="lg" onClick={() => onSelectMethod('sms')}>
                                        SMS Verification
                                    </Button>
                                )}
                                {hasTOTP && (
                                    <Button
                                        w="100%"
                                        variant={hasBoth ? 'outline' : 'filled'}
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
