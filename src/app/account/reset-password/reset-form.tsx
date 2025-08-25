'use client'

import { Button, TextInput, Paper, Title, Flex } from '@mantine/core'
import { isEmail, useForm } from '@mantine/form'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString } from '@/lib/errors'
import { useMutation } from '@/components/common'

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
        <form onSubmit={emailForm.onSubmit((values) => onSubmitEmail(values))}>
            <Paper bg="white" shadow="none" p="xxl">
                <Flex direction="column" gap="md">
                    <Title mb="sm" ta="center" order={3}>
                        Reset your password
                    </Title>

                    <TextInput
                        key={emailForm.key('email')}
                        {...emailForm.getInputProps('email')}
                        label="Enter registered email"
                        placeholder="Email address"
                        aria-label="Email"
                    />

                    <Button w="100%" mt="md" mb="xl" type="submit" loading={isPending} disabled={!emailForm.isValid()}>
                        Send Verification Code
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
