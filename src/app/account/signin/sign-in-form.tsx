import { Flex, Button, TextInput, PasswordInput, Paper, Title, CloseButton, Group, Text } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { reportError } from '@/components/errors'
import { useSignIn, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { type MFAState, signInToMFAState } from './logic'
import { FC, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { errorToString } from '@/components/errors'

const signInSchema = z.object({
    email: z.string().min(1, 'Email is required').max(250, 'Email too long').email('Invalid email'),
    password: z.string().min(1, 'Required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export const SignInForm: FC<{
    mfa: MFAState
    onComplete: (state: MFAState) => Promise<void>
}> = ({ mfa, onComplete }) => {
    const { setActive, signIn } = useSignIn()
    const { isSignedIn } = useUser()
    const router = useRouter()
    const [clerkError, setClerkError] = useState<{ title: string; message: string } | null>(null)

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
                await onComplete(false)
                router.push('/')
            }
            if (attempt.status === 'needs_second_factor') {
                const state = await signInToMFAState(attempt)
                await onComplete(state)
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')

            const errorMessage = errorToString(err)

            //incorrect email or password
            if (errorMessage?.includes('Password') || errorMessage?.includes('Identifier')) {
                form.setFieldError('email', ' ')
                form.setFieldError(
                    'password',
                    'Invalid login credentials. Please double-check your email and password.',
                )
                return
            }

            // any other clerk error
            setClerkError({
                title: 'Sign-in Error',
                message: errorMessage || 'An error occurred during sign-in. Please try again.',
            })
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
                    <Button mb="xxl" disabled={!form.isValid()} type="submit">
                        Login
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
