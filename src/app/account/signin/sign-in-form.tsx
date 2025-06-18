import { Flex, Button, TextInput, PasswordInput, Paper, Title, CloseButton, Group, Text } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { isClerkApiError, reportError } from '@/components/errors'
import { useSignIn, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { type MFAState, signInToMFAState } from './logic'
import { FC, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { formatClerkErrorCode } from '@/lib/string'
import { useMutation } from '@tanstack/react-query'
import { checkPendingInviteForMfaUserAction } from '@/server/actions/user.actions'

const signInSchema = z.object({
    email: z.string().min(1, 'Email is required').max(250, 'Email too long').email('Invalid email'),
    password: z.string().min(1, 'Required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export const SignInForm: FC<{
    mfa: MFAState
    onComplete: (state: MFAState) => void
}> = ({ mfa, onComplete }) => {
    const { setActive, signIn } = useSignIn()
    const { isSignedIn } = useUser()
    const router = useRouter()
    const searchParams = useSearchParams()
    const inviteId = searchParams.get('inviteId')
    const [clerkError, setClerkError] = useState<{ title: string; message: string } | null>(null)
    const { mutateAsync: checkPendingInvite, isPending: isCheckingInvite } = useMutation({
        mutationFn: checkPendingInviteForMfaUserAction,
    })

    const form = useForm<SignInFormData>({
        initialValues: {
            email: '',
            password: '',
        },
        validate: zodResolver(signInSchema),
    })

    if (isSignedIn || !signIn || mfa) return null

    const onSubmit = form.onSubmit(async (values) => {
        try {
            const attempt = await signIn.create({
                identifier: values.email,
                password: values.password,
            })
            if (attempt.status === 'complete') {
                await setActive({ session: attempt.createdSessionId })
                onComplete(false)
                if (inviteId) {
                    router.push(`/account/invitation/${inviteId}`)
                } else {
                    router.push('/')
                }
            }
            if (attempt.status === 'needs_second_factor') {
                // This handles the "switched browser" or stale ID case.
                const isPending = await checkPendingInvite(values.email)
                if (isPending) {
                    form.setErrors({
                        email: 'To complete your account setup, please use the link from your invitation email.',
                    })
                    return
                }

                // If we're here, there was no pending invite.
                // It's safe to proceed to MFA.
                const state = await signInToMFAState(attempt)
                onComplete(state)
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')
            if (isClerkApiError(err)) {
                const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
                if (emailError) {
                    form.setFieldError('email', emailError.longMessage)
                    return
                }

                const passwordError = err.errors?.find((error) => error.meta?.paramName === 'password')
                if (passwordError) {
                    form.setFieldError('password', passwordError.longMessage)
                    return
                }

                const authError = err.errors?.find(
                    (error) =>
                        error.code === 'form_password_incorrect' ||
                        error.code === 'session_invalid' ||
                        error.code === 'form_identifier_not_found',
                )
                if (authError) {
                    form.setFieldError(
                        'password',
                        'Invalid login credentials. Please double-check your email and password.',
                    )
                    return
                }

                if (err.errors?.length) {
                    setClerkError({
                        title: formatClerkErrorCode(err.errors[0].code),
                        message: err.errors[0].longMessage || 'An error occurred during sign-in. Please try again.',
                    })
                    return
                }
            }

            // fallback for non-clerk errors
            form.setFieldError('password', 'Invalid login credentials. Please double-check your email and password.')
        }
    })

    return (
        <form onSubmit={onSubmit}>
            <Paper bg="white" radius="sm" p="xxl">
                <Flex direction="column" gap="xs">
                    <Title mb="xs" order={3} ta="center">
                        Welcome To SafeInsights!
                    </Title>
                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Email"
                        placeholder="Enter your registered email address"
                        aria-label="Email"
                    />
                    <PasswordInput
                        label="Password"
                        key={form.key('password')}
                        {...form.getInputProps('password')}
                        mt={10}
                        mb="xs"
                        placeholder="*********"
                        aria-label="Password"
                    />
                    {clerkError && (
                        <Paper bg="#FFEFEF" shadow="none" p={'lg'} mt="sm" mb="sm" radius="sm">
                            <Group justify="space-between" gap="xl">
                                <Text ta="left" c="red" fw="bold">
                                    {clerkError.title}
                                </Text>
                                <CloseButton
                                    c="red"
                                    aria-label="Close password reset form"
                                    onClick={() => setClerkError(null)}
                                />
                            </Group>
                            <Text mt="md">{clerkError.message}</Text>
                        </Paper>
                    )}
                    <Link href="/account/reset-password">Forgot password?</Link>
                    {/*<Link href="/account/signup">Don&#39;t have an account? Sign Up Now</Link>*/}
                    <Button mb="xxl" disabled={!form.isValid()} loading={isCheckingInvite} type="submit">
                        Login
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
