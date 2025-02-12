'use client'

import { useState } from 'react'
import { isClerkApiError, reportError } from './errors'
import { Title, Anchor, Button, Group, Loader, PasswordInput, Stack, Text, TextInput, Paper } from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import { SignInResource } from '@clerk/types'

const isUsingPhoneMFA = (signIn: SignInResource) => {
    return Boolean(
        signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code') &&
            !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'totp'),
    )
}

type MFAState = false | { usingSMS: boolean; signIn: SignInResource }

export function SignIn() {
    const { isLoaded, signIn, setActive } = useSignIn()

    const [needsMFA, setNeedsMFA] = useState<MFAState>(false)

    const router = useRouter()

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
                router.push('/')
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
            router.push('/')
        } else {
            reportError(`Unknown signIn status: ${signInAttempt.status}`)
        }
    })

    if (needsMFA) {
        return (
            <Stack>
                <Title order={3}>Enter MFA Code</Title>
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
            </Stack>
        )
    }

    return (
        <Stack>
            <form onSubmit={onSubmit}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Welcome To SafeInsights</Text>
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
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
                </Paper>
            </form>
        </Stack>
    )
}
