'use client'

import { useState } from '@/common'
import { InputError } from '@/components/errors'
import { AppModal } from '@/components/modal'
import { useSignIn, useUser } from '@clerk/nextjs'
import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { Step } from './mfa'

export const dynamic = 'force-dynamic'

export const RecoveryCodeMFAReset = ({ setStep }: { setStep: (step: Step) => void }) => {
    const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn()
    const { user } = useUser()
    const router = useRouter()

    const [isConfirmOpen, setIsConfirmOpen] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [verifiedSessionId, setVerifiedSessionId] = useState<string | null>(null)

    const form = useForm({
        initialValues: { code: '' },
        validate: {
            code: (value: string) =>
                /^[a-zA-Z0-9]+$/.test(value.trim()) ? null : 'Only alphanumeric characters are allowed',
        },
    })

    if (!isSignInLoaded) return null

    const handleSubmit = async (values: typeof form.values) => {
        const trimmed = values.code.trim()

        if (!signIn) {
            return
        }

        try {
            const result = await signIn.attemptSecondFactor({ strategy: 'backup_code', code: trimmed })

            if (result.status !== 'complete') {
                form.setFieldError('code', 'Code is incorrect or already in use. Please try another.')
                return
            }

            // store session id but postpone activation until user confirms reset
            setVerifiedSessionId(result.createdSessionId)
            setIsConfirmOpen(true)
        } catch {
            form.setFieldError('code', 'Code is incorrect or already in use. Please try another.')
        }
    }

    const proceedReset = async () => {
        if (!verifiedSessionId) return
        setIsProcessing(true)
        try {
            // activate the session verified by backup code
            await setActive?.({ session: verifiedSessionId })

            if (user) {
                // Disable TOTP if enabled
                if (user.totpEnabled) {
                    await user.disableTOTP()
                }

                // Remove any phone numbers used for MFA
                for (const phone of user.phoneNumbers) {
                    if (phone.reservedForSecondFactor || phone.defaultSecondFactor) {
                        try {
                            await phone.destroy()
                        } catch {
                            await phone.setReservedForSecondFactor({ reserved: false })
                        }
                    }
                }
            }

            notifications.show({ message: 'MFA has been reset. Please set up a new method.', color: 'green' })
            router.push('/account/mfa')
        } catch {
            notifications.show({ message: 'Failed to reset MFA', color: 'red' })
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <>
            <Stack mb="xxl">
                <Title mb="xs" ta="center" order={3}>
                    Use recovery code to reset your MFA
                </Title>
                <Text size="md">
                    If you no longer have access to your authentication device, you can use one of your saved recovery
                    codes to verify your identity and reset your Multi-Factor Authentication (MFA).
                </Text>
                <Text size="md">Enter one of your recovery codes below. Each code can only be used once.</Text>
                <Text size="md" c="red.8" mb="xs">
                    <b>Note:</b> If you proceed with this option, you will be required to reset your chosen MFA method.
                    This ensures your account remains secure.
                </Text>

                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack gap="xs">
                        <TextInput
                            label="Enter recovery code"
                            placeholder="Each code can only be used once"
                            key={form.key('code')}
                            {...form.getInputProps('code')}
                            error={undefined}
                            autoComplete="one-time-code"
                        />
                        <InputError error={form.errors.code} />
                        <Button
                            type="submit"
                            fullWidth
                            size="lg"
                            disabled={form.values.code.trim().length === 0 || Boolean(form.errors.code)}
                            mt="md"
                        >
                            Reset MFA
                        </Button>
                        <Group gap="xs" justify="center">
                            <Button onClick={() => setStep('select')} mt="md" fw={600} fz="md" variant="subtle">
                                <CaretLeftIcon size={20} />
                                Back to options
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Stack>
            <ConfirmationModal
                isConfirmOpen={isConfirmOpen}
                setIsConfirmOpen={setIsConfirmOpen}
                isProcessing={isProcessing}
                proceedReset={proceedReset}
            />
        </>
    )
}

export const ConfirmationModal = ({
    isConfirmOpen,
    setIsConfirmOpen,
    isProcessing,
    proceedReset,
}: {
    isConfirmOpen: boolean
    setIsConfirmOpen: (isOpen: boolean) => void
    isProcessing: boolean
    proceedReset: () => void
}) => {
    return (
        <AppModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} title="Confirm MFA reset">
            <Stack>
                <Text size="md">You are about to reset your Multi-Factor Authentication (MFA) settings.</Text>
                <Text size="md">
                    This means your current authentication method will be removed, and you’ll need to set up MFA again
                    to secure your account.
                </Text>
                <Text size="md">Do you want to proceed?</Text>
                <Group gap="sm" mt="md">
                    <Button size="md" variant="outline" onClick={() => setIsConfirmOpen(false)}>
                        Cancel
                    </Button>
                    <Button size="md" loading={isProcessing} onClick={proceedReset}>
                        Reset MFA
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
