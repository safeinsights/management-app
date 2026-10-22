'use client'

import { FC } from 'react'
import { Anchor, Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import PhoneInput, { isPossiblePhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { InputError } from '@/components/errors'
import { revalidateOnBlur } from '@/components/form-field'
import { BackLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import styles from './panel.module.css'
import OtpInput from '@/components/otp-input'
import { fontWeight, semanticColor } from '@/theme/tokens'

const PHONE_ERROR_ID = 'sms-mfa-phone-error'

export type PhoneFormValues = { phoneNumber: string }

export type AddSmsMfaViewProps = {
    isVisible: boolean
    form: UseFormReturnType<PhoneFormValues>
    onSubmit: (values: PhoneFormValues) => void
    isSendingSms: boolean
}

export const AddSmsMfaView: FC<AddSmsMfaViewProps> = ({ isVisible, form, onSubmit, isSendingSms }) => {
    if (!isVisible) return null

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack justify="center">
                <Title order={3} ta="center">
                    SMS verification
                </Title>
                <Text>Enter your phone number to receive a verification code via SMS to complete the setup.</Text>
                <Text fz="sm" fw={fontWeight.semibold}>
                    Enter phone number
                </Text>
                {/* PhoneInput is a third-party control, so it cannot take getInputProps; blur
                validation is wired by hand (OTTER-647). */}
                <PhoneInput
                    international
                    countryCallingCodeEditable={false}
                    defaultCountry="US"
                    value={form.values.phoneNumber}
                    onChange={(value) => form.setFieldValue('phoneNumber', value ?? '')}
                    onBlur={revalidateOnBlur(form, 'phoneNumber')}
                    placeholder="Enter phone number"
                    countries={['US']}
                    className={styles.phoneInput}
                    label="Phone Number"
                    aria-invalid={!!form.errors.phoneNumber || undefined}
                    aria-describedby={form.errors.phoneNumber ? PHONE_ERROR_ID : undefined}
                />
                <Box id={PHONE_ERROR_ID}>
                    <InputError error={form.errors.phoneNumber} />
                </Box>
                <Button
                    type="submit"
                    loading={isSendingSms}
                    w="100%"
                    size="md"
                    radius="sm"
                    disabled={!isPossiblePhoneNumber(form.values.phoneNumber.trim())}
                >
                    Send verification code
                </Button>
                <Group gap="xs" justify="center">
                    <BackLink href={Routes.accountMfa}>Back to options</BackLink>
                </Group>
            </Stack>
        </form>
    )
}

export type OtpFormValues = { code: string }

export type AddSmsOtpViewProps = {
    isVisible: boolean
    form: UseFormReturnType<OtpFormValues>
    onSubmit: (values: OtpFormValues) => void
    onResend: () => void
    isVerifyingCode: boolean
    phoneLastFour?: string
}

export const AddSmsOtpView: FC<AddSmsOtpViewProps> = ({
    isVisible,
    form,
    onSubmit,
    onResend,
    isVerifyingCode,
    phoneLastFour,
}) => {
    if (!isVisible) return null

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack align="center" gap="sm">
                <Title order={3}>Verify your code</Title>
                <Text>
                    We’ve sent a 6-digit code to your phone number ending in {'****'}
                    {phoneLastFour}. Please enter it below to continue.
                </Text>
                <Title order={4} ta="center" mt="xs">
                    Enter your code
                </Title>
                <OtpInput form={form} errorId="add-sms-mfa-code-error" />
                <Box id="add-sms-mfa-code-error">
                    <InputError error={form.errors.code} />
                </Box>
                <Button
                    type="submit"
                    w="100%"
                    size="md"
                    radius="sm"
                    loading={isVerifyingCode}
                    disabled={!/\d{6,}/.test(form.values.code)}
                >
                    Verify code
                </Button>
                <Group>
                    <Text fz="md" c={semanticColor('text.secondary')}>
                        Didn’t receive a code?{' '}
                        <Anchor component="button" onClick={onResend}>
                            Resend code
                        </Anchor>
                    </Text>
                </Group>
                <Group gap="xs" justify="center">
                    <BackLink href={Routes.accountMfa}>Back to options</BackLink>
                </Group>
            </Stack>
        </form>
    )
}
