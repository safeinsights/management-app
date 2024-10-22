'use client'

import { useState } from 'react'
import { reportError } from './errors'
import { Anchor, Button, Group, Loader, Stack, Text, TextInput, Paper, CloseButton } from '@mantine/core'
import { isEmail, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'

interface ResetPasswordFormValues {
    email: string
}

export function ResetPassword() {
    const { isLoaded, signIn } = useSignIn()
    const [emailSent, setEmailSent] = useState(false)
    const router = useRouter()

    const form = useForm<ResetPasswordFormValues>({
        initialValues: {
            email: '',
        },
        validate: {
            email: isEmail('Invalid email'),
        },
    })

    if (!isLoaded) {
        return <Loader />
    }

    const onSubmit = async (values: ResetPasswordFormValues) => {
        if (!isLoaded) return

        try {
            await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: values.email,
            })
            setEmailSent(true)
        } catch (err: any) {
            reportError(err, 'failed to initiate password reset')

            const emailError = err.errors?.find((error: any) => error.meta?.paramName === 'email_address')
            if (emailError) {
                form.setFieldError('email', emailError.longMessage)
            }
        }
    }

    if (emailSent) {
        return (
            <Stack>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Check Your Email</Text>
                        <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>We've sent password reset instructions to your email address.</Text>
                    <Stack align="center" mt={15}>
                        <Button onClick={() => router.push('/')}>Return to Login</Button>
                    </Stack>
                </Paper>
            </Stack>
        )
    }

    return (
        <Stack>
            <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Reset Password</Text>
                        <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>Enter your email address and we'll send you instructions to reset your password.</Text>
                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Email"
                        placeholder="Email address"
                        aria-label="Email address"
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Reset Password</Button>
                        <Anchor onClick={() => router.push('/')}>Back to Login</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
