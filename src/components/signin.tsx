'use client'

import { reportError } from './errors'
import { Anchor, Button, Group, Loader, PasswordInput, Stack, Text, TextInput, Paper } from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'

export function SignIn() {
    const { isLoaded, signIn, setActive } = useSignIn()
    const router = useRouter()

    interface SignInFormValues {
        email: string
        password: string
    }

    const form = useForm<SignInFormValues>({
        initialValues: {
            email: '',
            password: '',
        },

        validate: {
            email: isEmail('Invalid email'),
            password: isNotEmpty('Required'),
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
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
             
            reportError(err, 'failed signin')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const emailError = err.errors?.find((error: any) => error.meta?.paramName === 'email_address')
            if (emailError) {
                form.setFieldError('email', emailError.longMessage)
            }
        }
    })

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
                        <Anchor href="/signup">Don&#39;t have an account? Sign Up Now</Anchor>
                        <Anchor href="/reset-password">Forgot password?</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
