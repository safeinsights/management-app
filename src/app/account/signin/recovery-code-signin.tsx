'use client'

import { InputError } from '@/components/errors'
import { useMutation } from '@/hooks/query-wrappers'
import { errorToString } from '@/lib/errors'
import { useSignIn } from '@clerk/nextjs'
import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { Step } from './mfa'
import { Routes } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const RecoveryCodeSignIn = ({ setStep }: { setStep: (step: Step) => void }) => {
    const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn()
    const router = useRouter()

    const form = useForm({
        initialValues: { code: '' },
        validate: {
            code: (value: string) =>
                /^[a-zA-Z0-9]+$/.test(value.trim()) ? null : 'Only alphanumeric characters are allowed',
        },
    })

    const { mutate: signInWithRecoveryCode, isPending: isProcessing } = useMutation({
        mutationFn: async (code: string) => {
            if (!signIn) throw new Error('SignIn not loaded')

            const result = await signIn.attemptSecondFactor({ strategy: 'backup_code', code })

            if (result.status !== 'complete') {
                throw new Error('Verification failed')
            }

            // activate the session verified by backup code
            await setActive?.({ session: result.createdSessionId })
        },
        onSuccess: () => {
            notifications.show({
                message: 'You have signed in using a recovery code.',
                color: 'green',
            })
            router.push(Routes.dashboard)
        },
        onError: (err) => {
            form.setFieldError(
                'code',
                errorToString(err, {
                    form_code_incorrect: 'Code is incorrect or already in use. Please try another.',
                }),
            )
        },
    })

    if (!isSignInLoaded) return null

    const handleSubmit = async (values: typeof form.values) => {
        const trimmed = values.code.trim()
        signInWithRecoveryCode(trimmed)
    }

    return (
        <Stack mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Use recovery code to sign in
            </Title>
            <Text size="md">
                If you no longer have access to your authentication device, you can use one of your saved recovery codes
                to verify your identity and access your account.
            </Text>
            <Text size="md">Enter one of your recovery codes below. Each code can only be used once.</Text>
            <Text size="md" c="blue.8" mb="xs">
                <b>Note:</b> If you have lost your authentication device permanently, you should reset your MFA settings
                after signing in.
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
                        loading={isProcessing}
                        disabled={form.values.code.trim().length === 0 || Boolean(form.errors.code)}
                        mt="md"
                    >
                        Sign in
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
    )
}
