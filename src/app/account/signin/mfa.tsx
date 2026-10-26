'use client'

import type { FC } from 'react'
import { Button, Divider, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { semanticColor } from '@/theme/tokens'
import type { MFAState } from './logic'
import { RecoveryCodeSignIn } from './recovery-code-signin'
import { useRequestMfa, type Method, type Step } from './use-request-mfa'
import { VerifyCode } from './verify-code'

type FactorChoicesProps = {
    isVisible: boolean
    hasSMS: boolean
    hasTOTP: boolean
    onSelectMethod: (method: Method) => void
}

const FactorChoices: FC<FactorChoicesProps> = ({ isVisible, hasSMS, hasTOTP, onSelectMethod }) => {
    if (!isVisible) return null

    return (
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
                        variant={hasSMS ? 'outline' : 'filled'}
                        size="lg"
                        onClick={() => onSelectMethod('totp')}
                    >
                        Authenticator app verification
                    </Button>
                )}
            </Stack>
            <Divider my="xs" />
            <Text size="md" c={semanticColor('text.secondary')}>
                Can’t access your MFA device?
            </Text>
        </>
    )
}

type SelectMethodStepProps = {
    isVisible: boolean
    hasSMS: boolean
    hasTOTP: boolean
    onSelectMethod: (method: Method) => void
    onUseRecoveryCode: () => void
}

const SelectMethodStep: FC<SelectMethodStepProps> = ({
    isVisible,
    hasSMS,
    hasTOTP,
    onSelectMethod,
    onUseRecoveryCode,
}) => {
    if (!isVisible) return null

    const hasNoFactors = !hasSMS && !hasTOTP

    return (
        <Stack mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Multi-Factor Authentication required
            </Title>
            <Text size="md" mb="xs">
                To complete the log in process, please verify your identity using Multi-Factor Authentication (MFA).
            </Text>
            {hasNoFactors && (
                <Text size="sm" c={semanticColor('error.text')} mb="xs">
                    No MFA factors are configured for your account. Please contact your administrator to set up MFA, or
                    use a recovery code if you have one.
                </Text>
            )}
            <FactorChoices
                isVisible={!hasNoFactors}
                hasSMS={hasSMS}
                hasTOTP={hasTOTP}
                onSelectMethod={onSelectMethod}
            />
            <Button w="100%" variant="outline" size="lg" onClick={onUseRecoveryCode}>
                Try recovery code
            </Button>
        </Stack>
    )
}

// Mounted only on its step so its form starts empty each time it is opened.
const RecoveryStep: FC<{ isVisible: boolean; setStep: (step: Step) => void }> = ({ isVisible, setStep }) => {
    if (!isVisible) return null

    return <RecoveryCodeSignIn setStep={setStep} />
}

export const RequestMFA: FC<{ mfa: MFAState }> = ({ mfa }) => {
    const {
        isHidden,
        isLoaded,
        step,
        setStep,
        method,
        hasSMS,
        hasTOTP,
        form,
        isPending,
        onMFASubmit,
        onSelectMethod,
        resetFlow,
        maskedPhone,
    } = useRequestMfa(mfa)

    if (isHidden || !mfa) return null
    if (!isLoaded) return <Loader />

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" w={500} my={{ base: '1rem', lg: 0 }}>
            <SelectMethodStep
                isVisible={step === 'select'}
                hasSMS={hasSMS}
                hasTOTP={hasTOTP}
                onSelectMethod={onSelectMethod}
                onUseRecoveryCode={() => setStep('recovery')}
            />
            <VerifyCode
                isVisible={step === 'verify'}
                signIn={mfa.signIn}
                phoneNumber={maskedPhone}
                form={form}
                isVerifyingCode={isPending}
                method={method}
                onSubmit={onMFASubmit}
                resetFlow={resetFlow}
            />
            <RecoveryStep isVisible={step === 'recovery'} setStep={setStep} />
        </Paper>
    )
}
