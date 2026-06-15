'use client'

import { FC } from 'react'
import { Button, Group, Stack, Text, Title } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { CaretLeftIcon } from '@phosphor-icons/react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { InputError } from '@/components/errors'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import styles from './panel.module.css'

// Presentational step-1 ("SMS verification") card for SMS MFA enrollment. It owns the
// phone-number form layout, the send-code submit row, and the "Back to options" link, but
// NOT the Clerk enroll flow (createPhoneNumber / prepareVerification / verification steps).
// Kept in its OWN file (free of Clerk's useUser / useReverification) so it renders in
// isolation (e.g. Ladle). @mantine/form's useForm works under Ladle, so the container
// builds the form and passes it down along with the submit handler and loading state.

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
            <PhoneInput
                international
                countryCallingCodeEditable={false}
                defaultCountry="US"
                value={form.values.phoneNumber}
                onChange={(value) => form.setFieldValue('phoneNumber', value ?? '')}
                placeholder="Enter phone number"
                countries={['US']} // limited to US code
                className={styles.phoneInput}
                label="Phone Number"
            />
            {form.errors.phoneNumber && <InputError error={form.errors.phoneNumber} />}
            <Button
                type="submit"
                loading={isSendingSms}
                w="100%"
                size="md"
                variant="primary"
                radius="sm"
                disabled={!/\d{6,}/.test(form.values.phoneNumber)}
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
