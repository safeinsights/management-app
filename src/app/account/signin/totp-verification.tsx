import { InputError } from '@/components/errors'
import { Button, Group, PinInput, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CaretLeftIcon } from '@phosphor-icons/react'

interface TotpVerificationProps {
    form: UseFormReturnType<{ code: string }>
    isVerifyingCode: boolean
    resetFlow: () => void
}

export const TotpVerification = ({ form, isVerifyingCode, resetFlow }: TotpVerificationProps) => {
    return (
        <>
            <Text>Open your authenticator app and enter the 6-digit code generated for your account.</Text>
            <Text>This code changes every 30 seconds and helps ensure your account remains secure.</Text>
            <Title order={4} ta="center" mt="xs" mb={'-0.5rem'}>
                Enter your code
            </Title>
            <PinInput
                length={6}
                placeholder="0"
                size="lg"
                type="number"
                error={!!form.errors.code}
                {...form.getInputProps('code')}
            />
            <InputError error={form.errors.code} />
            <Button
                type="submit"
                w="100%"
                size="lg"
                variant="primary"
                radius="sm"
                mt="xs"
                loading={isVerifyingCode}
                disabled={!/\d{6,}/.test(form.values.code)}
            >
                Verify code
            </Button>
            <Group gap="xs" justify="center">
                <Button onClick={resetFlow} mt="md" fw={600} fz="md" variant="subtle">
                    <CaretLeftIcon size={20} />
                    Back to options
                </Button>
            </Group>
        </>
    )
}
