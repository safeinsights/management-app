'use client'

import { ClerkErrorAlert } from '@/components/clerk-errors'
import { InputError } from '@/components/errors'
import type { SignInResource } from '@clerk/nextjs/types'
import { Button, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { RequestMFA } from '../signin/mfa'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { usePendingReset } from './use-pending-reset'

interface PendingResetProps {
    pendingReset: SignInResource
    onResetUpdate?: (updated: SignInResource) => void
}

export function PendingReset({ pendingReset, onResetUpdate }: PendingResetProps) {
    const {
        needsMFA,
        verificationForm,
        verificationError,
        canResend,
        isPending,
        isResending,
        requirementsDescription,
        onSubmitVerification,
        resendCode,
        markPasswordTouched,
    } = usePendingReset(pendingReset, onResetUpdate)

    if (needsMFA) return <RequestMFA mfa={needsMFA} />

    return (
        <form onSubmit={verificationForm.onSubmit((values) => onSubmitVerification(values))}>
            <Paper shadow="none" p="xxl" radius="sm">
                <Stack gap="xs" mb="xxl">
                    <Title mb="md" ta="center" order={3}>
                        Reset your password
                    </Title>
                    <TextInput
                        key={verificationForm.key('code')}
                        {...verificationForm.getInputProps('code')}
                        label="Enter verification code"
                        placeholder="A code has been sent to your registered email"
                        aria-label="Verification code"
                    />
                    <InputError error={verificationError} />
                    <Button
                        variant="transparent"
                        c={canResend ? semanticColor('link.default') : semanticColor('text.disabled')}
                        fw={fontWeight.semibold}
                        size="xs"
                        w="fit-content"
                        p={0}
                        loading={isResending}
                        onClick={resendCode}
                        disabled={isResending || !canResend}
                    >
                        Resend verification code
                    </Button>
                    <PasswordInput
                        key={verificationForm.key('password')}
                        {...verificationForm.getInputProps('password')}
                        onBlur={(event) => {
                            verificationForm.getInputProps('password').onBlur?.(event)
                            markPasswordTouched()
                        }}
                        label="Enter new password"
                        placeholder="********"
                        aria-label="New password"
                        mb="xs"
                        // Suppressed in favor of the requirements list below.
                        error={undefined}
                        aria-invalid={!!verificationForm.errors.password || undefined}
                        // Rendered as the description so Mantine owns the aria-describedby wiring.
                        description={requirementsDescription}
                        // Below the input, not Mantine's default above: this is live validation
                        // feedback.
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                    />

                    <PasswordInput
                        key={verificationForm.key('confirmPassword')}
                        {...verificationForm.getInputProps('confirmPassword')}
                        label="Confirm new password"
                        placeholder="********"
                        aria-label="Confirm New password"
                        mb="md"
                        error={
                            verificationForm.errors.confirmPassword && (
                                <InputError error={verificationForm.errors.confirmPassword} />
                            )
                        }
                        // PasswordInput's inner <input> has withAria disabled, so `error` alone
                        // never marks it invalid to assistive tech (OTTER-647).
                        aria-invalid={!!verificationForm.errors.confirmPassword || undefined}
                    />
                    <ClerkErrorAlert
                        onClose={() => verificationForm.clearFieldError('form')}
                        error={verificationForm.errors.form}
                    />
                    <Button type="submit" size="lg" loading={isPending} disabled={!verificationForm.isValid()}>
                        Update password
                    </Button>
                </Stack>
            </Paper>
        </form>
    )
}
