import { Panel } from '@/components/panel'
import { Flex, Button, TextInput, PasswordInput, Stack } from '@mantine/core'
import { isNotEmpty, isEmail, useForm } from '@mantine/form'
import { isClerkApiError, reportError } from '@/components/errors'
import { useSignIn, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { type MFAState, isUsingPhoneMFA } from './logic'
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
                const usingSMS = isUsingPhoneMFA(attempt)
                if (usingSMS) {
                    await attempt.prepareSecondFactor({ strategy: 'phone_code' })
                }
                onComplete({ signIn: attempt, usingSMS })
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')
            if (isClerkApiError(err)) {
                const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
                if (emailError) {
                    form.setFieldError('email', emailError.longMessage)
                }
            }
        }
    })

    return (
        <form onSubmit={onSubmit}>
            <Panel title="Welcome To SafeInsights">
                <TextInput
                    key={form.key('email')}
                    {...form.getInputProps('email')}
                    label="Email"
                    placeholder="Email address"
                    aria-label="Email"
                />
                <PasswordInput
                    withAsterisk
                    label="Password"
                    key={form.key('password')}
                    {...form.getInputProps('password')}
                    mt={10}
                    placeholder="Password"
                    aria-label="Password"
                />
                <Flex align="center" mt={15} gap="md">
                    <Button type="submit">Login</Button>
                    <Stack>
                        {/* https://openstax.atlassian.net/browse/OTTER-107 Temporarily remove signup page on production*/}
                        {/*<Link href="/account/signup">Don&#39;t have an account? Sign Up Now</Link>*/}
                        <Link href="/account/reset-password">Forgot password?</Link>
                    </Stack>
                </Flex>
            </Panel>
        </form>
    )
}
