'use client'

import { Button, Group, Stack, Text, TextInput, Paper, CloseButton, Anchor } from '@mantine/core'
import { isEmail, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource, ClerkAPIError } from '@clerk/types'
import { reportError } from '../errors'

interface ResetFormValues {
    email: string
}

interface ResetFormProps {
    onComplete: (reset: SignInResource) => void
}

export function ResetForm({ onComplete }: ResetFormProps) {
    const { isLoaded, signIn } = useSignIn()
    const router = useRouter()

    const emailForm = useForm<ResetFormValues>({
        initialValues: {
            email: '',
        },
        validate: {
            email: isEmail('Invalid email'),
        },
    })

    const onSubmitEmail = async (values: ResetFormValues) => {
        if (!isLoaded) return

        try {
            const reset = await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: values.email,
            })
            onComplete(reset)
        } catch (err) {
            reportError(err, 'failed to initiate password reset')

            const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
            if (emailError) {
                emailForm.setFieldError('email', emailError.longMessage)
            }
        }
    }

    return (
        <Stack>
            <form onSubmit={emailForm.onSubmit((values) => onSubmitEmail(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Reset Password</Text>
                        <CloseButton aria-label="Close password reset form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>Enter your email address and we&#39;ll send you a verification code.</Text>
                    <TextInput
                        key={emailForm.key('email')}
                        {...emailForm.getInputProps('email')}
                        label="Email"
                        placeholder="Email address"
                        aria-label="Email"
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Send Reset Code</Button>
                        <Anchor onClick={() => router.push('/')}>Back to Login</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
