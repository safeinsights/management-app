import { Flex, Button, TextInput, PasswordInput, Paper, Title } from '@mantine/core'
import { isNotEmpty, isEmail, useForm } from '@mantine/form'
import { isClerkApiError, reportError } from '@/components/errors'
import { useSignIn, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { type MFAState, signInToMFAState } from './logic'
import { FC } from 'react'
import { useRouter } from 'next/navigation'

export const SignInForm: FC<{
    mfa: MFAState
    onComplete: (state: MFAState) => void
}> = ({ mfa, onComplete }) => {
    const { setActive, signIn } = useSignIn()
    const { isSignedIn } = useUser()
    const router = useRouter()

    const form = useForm({
        initialValues: {
            email: '',
            password: '',
        },

        validate: {
            email: isEmail('Invalid email'),
            password: isNotEmpty('Required'),
        },
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
                router.push('/')
            }
            if (attempt.status === 'needs_second_factor') {
                const state = await signInToMFAState(attempt)
                onComplete(state)
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')
            if (isClerkApiError(err)) {
                const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
                if (emailError) {
                    form.setFieldError('email', emailError.longMessage)
                }
            }
            form.setFieldError('password', 'Invalid login credentials. Please double-check your email and password.')
        }
    })

    return (
        <form onSubmit={onSubmit}>
            <Paper bg="white" radius="none" p="xxl">
                <Flex direction="column" gap="xs">
                    <Title order={3} ta="center">
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
                        placeholder="Password"
                        aria-label="Password"
                    />
                    <Link href="/account/reset-password">Forgot password?</Link>
                    {/*<Link href="/account/signup">Don&#39;t have an account? Sign Up Now</Link>*/}
                    <Button disabled={!form.isValid()} type="submit">
                        Login
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
