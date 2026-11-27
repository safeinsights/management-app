'use client'

import { useMutation } from '@/hooks/query-wrappers'
import { errorToString } from '@/lib/errors'
import { useSignIn } from '@clerk/nextjs'
import { Button, Group, Stack, Text, TextInput, Title } from '@mantine/core'
import { useForm } from '@/common'
import { showToast } from '@/components/toast-notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import type { Step } from './use-request-mfa'
import { throwOnClerkError } from './logic'
import { useCompleteSignIn } from './use-complete-sign-in'
import { fontWeight, semanticColor } from '@/theme/tokens'

export const RecoveryCodeSignIn = ({ setStep }: { setStep: (step: Step) => void }) => {
    const { signIn } = useSignIn()
    const completeSignIn = useCompleteSignIn()

    const form = useForm({
        initialValues: { code: '' },
        validate: {
            code: (value: string) =>
                /^[a-zA-Z0-9]+$/.test(value.trim()) ? null : 'Only alphanumeric characters are allowed',
        },
    })

    const { mutate: signInWithRecoveryCode, isPending: isProcessing } = useMutation({
        mutationFn: async (values: typeof form.values) => {
            await throwOnClerkError(signIn.mfa.verifyBackupCode({ code: values.code.trim() }))

            if (signIn.status !== 'complete') {
                throw new Error('Verification failed')
            }

            await throwOnClerkError(signIn.finalize())
        },
        onSuccess: async () => {
            showToast({
                category: 'success',
                title: 'You have signed in using a recovery code.',
            })
            await completeSignIn()
        },
        onError: (err) => {
            form.setFieldError(
                'code',
                errorToString(err, {
                    clerkOverrides: { form_code_incorrect: 'Code is incorrect or already in use. Please try another.' },
                }),
            )
        },
    })

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
            <Text size="md" c={semanticColor('info.text')} mb="xs">
                <b>Note:</b> If you have lost your authentication device permanently, you should reset your MFA settings
                after signing in.
            </Text>

            <form onSubmit={form.onSubmit((values) => signInWithRecoveryCode(values))}>
                <Stack gap="xs">
                    <TextInput
                        label="Enter recovery code"
                        placeholder="Each code can only be used once"
                        key={form.key('code')}
                        {...form.getInputProps('code')}
                        autoComplete="one-time-code"
                    />
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
                        <Button
                            onClick={() => setStep('select')}
                            mt="md"
                            fw={fontWeight.semibold}
                            fz="md"
                            variant="subtle"
                        >
                            <CaretLeftIcon size={20} />
                            Back to options
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Stack>
    )
}
