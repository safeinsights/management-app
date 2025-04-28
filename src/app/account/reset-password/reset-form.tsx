'use client'

import { Button, Group, Stack, Text, TextInput, Paper, CloseButton, Anchor } from '@mantine/core'
import { isEmail, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString } from '@/lib/errors'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@/components/links'

interface ResetFormValues {
    email: string
}

interface ResetFormProps {
    onCompleteAction: (_reset: SignInResource) => void
}

export function ResetForm({ onCompleteAction }: ResetFormProps) {
    const { signIn } = useSignIn()
    const router = useRouter()

    const emailForm = useForm<ResetFormValues>({
        initialValues: {
            email: '',
        },
        validate: {
            email: isEmail('Invalid email'),
        },
    })

    const { isPending, mutate: onSubmitEmail } = useMutation({
        async mutationFn(form: ResetFormValues) {
            if (!signIn) return
            return await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: form.email,
            })
        },
        onError(error: unknown) {
            emailForm.setErrors({
                email: errorToString(error),
            })
        },
        onSuccess(info?: SignInResource) {
            if (info) {
                onCompleteAction(info)
            } else {
                // clerk did not throw an error but also did not return a signIn object
                emailForm.setErrors({
                    email: 'An unknown error occurred, please try again later.',
                })
            }
        },
    })

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
                        <Button type="submit" loading={isPending}>
                            Send Reset Code
                        </Button>
                        <Link href="/account/signin">Back to Login</Link>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
