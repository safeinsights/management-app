import { useState } from 'react'
import { reportError } from './errors'
import { Anchor, Button, Checkbox, Group, Loader, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import { SignInResource } from '@clerk/types'

export function SignIn() {
    const { isLoaded, signIn, setActive } = useSignIn()
    const [needsMFA, setNeedsMFA] = useState<SignInResource | false>(false)
    const router = useRouter()

    const form = useForm({
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
                setNeedsMFA(attempt)
            }
        } catch (err: any) {
            reportError(err, 'failed signin')

            const emailError = err.errors?.find((error: any) => error.meta?.paramName === 'email_address')
            if (emailError) {
                form.setFieldError('email', emailError.longMessage)
            }
        }
    })

    const onMFA = form.onSubmit(async (values) => {
        if (!isLoaded || !needsMFA) return

        const signInAttempt = await needsMFA.attemptSecondFactor({
            strategy: 'totp',
            code: values.code,
        })
        if (signInAttempt.status === 'complete') {
            await setActive({ session: signInAttempt.createdSessionId })
            router.push('/')
        }
    })

    if (needsMFA) {
        return (
            <Stack>
                <Title order={3}>Enter MFA Code</Title>
                <Text>Enter the code from your authenticator app</Text>

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
            <Title order={3}>Login</Title>

            <form onSubmit={onSubmit}>
                <TextInput
                    withAsterisk
                    label="Email"
                    placeholder="your@email.com"
                    key={form.key('email')}
                    {...form.getInputProps('email')}
                />

                <PasswordInput
                    withAsterisk
                    label="Password"
                    width={400}
                    key={form.key('password')}
                    {...form.getInputProps('password')}
                />
                <Anchor href="/reset-password">Forgot your password? Reset it here!</Anchor>

                <Group justify="flex-end" mt="md">
                    <Button type="submit">Login</Button>
                </Group>
            </form>
        </Stack>
    )
}
