'use client'

import { useState } from 'react'
import { isClerkApiError, reportError } from './errors'
import { Title, Anchor, Button, Group, Loader, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { Panel } from './panel'
import { useSignIn, useUser } from '@clerk/nextjs'
import { SignInResource } from '@clerk/types'
import Link from 'next/link'

const isUsingPhoneMFA = (signIn: SignInResource) => {
    return Boolean(
        signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code') &&
            !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'totp'),
    )
}

type MFAState = false | { usingSMS: boolean; signIn: SignInResource }

export function SignIn() {
    const { isLoaded, signIn, setActive } = useSignIn()

    const { user } = useUser()

    const [needsMFA, setNeedsMFA] = useState<MFAState>(false)

    interface SignInFormValues {
        email: string
        password: string
        code: string
    }

    const form = useForm<SignInFormValues>({
        initialValues: {
            email: '',
            code: '',
            password: '',
        },

        validate: {
            code: needsMFA ? isNotEmpty('Required') : undefined,
            email: needsMFA ? undefined : isEmail('Invalid email'),
            password: needsMFA ? undefined : isNotEmpty('Required'),
        },
    })

    if (!isLoaded) {
        return <Loader />
    }

    const onSubmit = form.onSubmit(async (values) => {
        if (!isLoaded) return

        try {
            const attempt = await signIn.create({
                identifier: values.email,
                password: values.password,
            })
            if (attempt.status === 'complete') {
                await setActive({ session: attempt.createdSessionId })
                setNeedsMFA(false)
            }
            if (attempt.status === 'needs_second_factor') {
                const usingSMS = isUsingPhoneMFA(attempt)
                if (usingSMS) {
                    await attempt.prepareSecondFactor({ strategy: 'phone_code' })
                }
                setNeedsMFA({ signIn: attempt, usingSMS })
            }
        } catch (err: unknown) {
            reportError(err, 'failed signin')
            if (isClerkApiError(err)) {
                const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
                if (emailError) {
                    form.setFieldError('email', emailError.longMessage)
                }
            }
        }
    })

    const onMFA = form.onSubmit(async (values) => {
        if (!isLoaded || !needsMFA) return

        const signInAttempt = await needsMFA.signIn.attemptSecondFactor({
            strategy: needsMFA.usingSMS ? 'phone_code' : 'totp',
            code: values.code,
        })

        if (signInAttempt.status === 'complete') {
            await setActive({ session: signInAttempt.createdSessionId })
            setNeedsMFA(false)
        } else {
            reportError(`Unknown signIn status: ${signInAttempt.status}`)
        }
    })

    if (user) {
        return (
            <Panel title={user.totpEnabled ? 'Signin Success' : 'Your account lacks MFA protection'}>
                {user.totpEnabled ? (
                    <Stack>
                        <Title order={3}>Your account lacks MFA protection</Title>
                        <Text>In order to use SafeInsights, you must have MFA enabled on your account</Text>
                        <Text>
                            Please Visit our <Link href="/account/mfa">MFA page</Link> in order to enable it.
                        </Text>
                    </Stack>
                ) : (
                    <Title order={4}>
                        You have successfully signed in. Visit the <Link href="/">homepage</Link> to get started.
                    </Title>
                )}
            </Panel>
        )
    }

    if (needsMFA) {
        return (
            <Panel title="Enter MFA Code">
                <Text>Enter the code from {needsMFA.usingSMS ? 'the text message we sent' : 'your app'}</Text>
                <form onSubmit={onMFA}>
                    <TextInput
                        withAsterisk
                        label="Code"
                        placeholder="123456"
                        key={form.key('code')}
                        {...form.getInputProps('code')}
                    />
                    <Group justify="space-between" mt="md">
                        <Button onClick={() => setNeedsMFA(false)}>ReEnter Email/Password</Button>
                        <Button type="submit">Login</Button>
                    </Group>
                </form>
            </Panel>
        )
    }

    return (
        <form onSubmit={onSubmit}>
            <Panel title="Welcome To SafeInsights">
                <TextInput
                    key={form.key('email')}
                    {...form.getInputProps('email')}
                    label="Login"
                    placeholder="Email address"
                    aria-label="Email"
                />
                <PasswordInput
                    withAsterisk
                    key={form.key('password')}
                    {...form.getInputProps('password')}
                    mt={10}
                    placeholder="Password"
                    aria-label="Password"
                />
                <Stack align="center" mt={15}>
                    <Button type="submit">Login</Button>
                    <Anchor href="/account/signup">Don&#39;t have an account? Sign Up Now</Anchor>
                    <Anchor href="/account/reset-password">Forgot password?</Anchor>
                </Stack>
            </Panel>
        </form>
    )
}
