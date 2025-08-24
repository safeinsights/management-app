'use client'

import { Link } from '@/components/links'
import { errorToString } from '@/lib/errors'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { Button, Flex, Paper, Stack, TextInput, Title } from '@mantine/core'
import { isEmail, useForm } from '@mantine/form'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'

interface ResetFormValues {
    email: string
}

interface ResetFormProps {
    onCompleteAction: (_reset: SignInResource) => void
}

export function ResetForm({ onCompleteAction }: ResetFormProps) {
    const { signIn } = useSignIn()

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
            // If Clerk returns email not found, do not show an error
            const message = errorToString(error)
            if (message.includes('find your account')) {
                onCompleteAction({} as SignInResource)
                return
            }
            emailForm.setErrors({ email: message })
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
        <form onSubmit={emailForm.onSubmit((values) => onSubmitEmail(values))}>
            <Paper bg="white" shadow="none" p="xxl">
                <Flex direction="column" gap="md" mb="lg">
                    <Title mb="xs" ta="center" order={3}>
                        Reset your password
                    </Title>

                    <TextInput
                        key={emailForm.key('email')}
                        {...emailForm.getInputProps('email')}
                        label="Enter registered email"
                        placeholder="Email address"
                        aria-label="Email"
                    />
                    <Stack align="center" gap="xs">
                        <Button
                            w="100%"
                            mt="xs"
                            type="submit"
                            size="lg"
                            loading={isPending}
                            disabled={!emailForm.isValid()}
                        >
                            Send Verification Code
                        </Button>
                        <Link
                            href="/account/signin"
                            mt="md"
                            c="purple.5"
                            fw={600}
                            fz="md"
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <CaretLeftIcon size={20} />
                            Back to log in
                        </Link>
                    </Stack>
                </Flex>
            </Paper>
        </form>
    )
}
