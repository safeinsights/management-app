'use client'

import { Container, Paper, Stack } from '@mantine/core'
import { semanticColor } from '@/theme/tokens'
import BackupCodes from '../app/backup-codes'
import { AddSmsMfaView, AddSmsOtpView } from './add-sms-mfa-view'
import { useAddSmsMfa } from './use-add-sms-mfa'

export function AddSMSMFA() {
    const {
        isReady,
        step,
        phoneForm,
        otpForm,
        isSendingSms,
        isVerifyingCode,
        phoneLastFour,
        backupCodes,
        sendVerificationCode,
        resendCode,
        verifyCodeAndSetMfa,
    } = useAddSmsMfa()

    if (!isReady) return null

    return (
        <Container>
            <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" maw={500} my={{ base: '1rem', lg: 0 }}>
                <Stack gap="lg">
                    <AddSmsMfaView
                        isVisible={step === 'phone'}
                        form={phoneForm}
                        onSubmit={sendVerificationCode}
                        isSendingSms={isSendingSms}
                    />
                    <AddSmsOtpView
                        isVisible={step === 'otp'}
                        form={otpForm}
                        onSubmit={verifyCodeAndSetMfa}
                        onResend={resendCode}
                        isVerifyingCode={isVerifyingCode}
                        phoneLastFour={phoneLastFour}
                    />
                    <BackupCodes isVisible={step === 'backup'} codes={backupCodes} />
                </Stack>
            </Paper>
        </Container>
    )
}
