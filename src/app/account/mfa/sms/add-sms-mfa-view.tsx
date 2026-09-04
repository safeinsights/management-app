'use client'

import { FC } from 'react'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { CaretLeftIcon } from '@phosphor-icons/react'
import PhoneInput, { isPossiblePhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { InputError } from '@/components/errors'
import { revalidateOnBlur } from '@/components/form-field'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import styles from './panel.module.css'

const PHONE_ERROR_ID = 'sms-mfa-phone-error'

export type PhoneFormValues = { phoneNumber: string }

export type AddSmsMfaViewProps = {
    form: UseFormReturnType<PhoneFormValues>
    onSubmit: (values: PhoneFormValues) => void
    isSendingSms: boolean
}

export const AddSmsMfaView: FC<AddSmsMfaViewProps> = ({ form, onSubmit, isSendingSms }) => (
    <form onSubmit={form.onSubmit(onSubmit)}>
        <Stack justify="center">
            <Title order={3} ta="center">
                SMS verification
            </Title>
            <Text>Enter your phone number to receive a verification code via SMS to complete the setup.</Text>
            <Text fz="sm" fw={500}>
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
            {form.errors.phoneNumber && (
                <Box id={PHONE_ERROR_ID}>
                    <InputError error={form.errors.phoneNumber} />
                </Box>
            )}
            <Button
                type="submit"
                loading={isSendingSms}
                w="100%"
                size="md"
                variant="filled"
                radius="sm"
                disabled={!isPossiblePhoneNumber(form.values.phoneNumber.trim())}
            >
                Send verification code
            </Button>
            <Group gap="xs" justify="center">
                <Link
                    href={Routes.accountMfa}
                    mt="md"
                    c="purple.5"
                    fw={600}
                    fz="md"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                    <CaretLeftIcon size={20} />
                    Back to options
                </Link>
            </Group>
        </Stack>
    </form>
)
