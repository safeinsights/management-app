'use client'

import { useState } from 'react'
import { reportError, isClerkApiError } from './errors'
import {
    Anchor,
    Button,
    Group,
    Loader,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Paper,
    CloseButton,
    Checkbox,
} from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignUp } from '@clerk/nextjs'
import { ClerkAPIError } from '@clerk/types'

interface SignUpFormValues {
    email: string
    password: string
    termsOfService: boolean
}

interface EmailVerificationFormValues {
    code: string
}

const EmailVerificationStep = () => {
    const { isLoaded, signUp, setActive } = useSignUp()
    const router = useRouter()

    const verifyForm = useForm<EmailVerificationFormValues>({
        initialValues: {
            code: '',
        },
    })

    const handleVerify = async (values: EmailVerificationFormValues) => {
        if (!isLoaded) return

        try {
            // Use the code the user provided to attempt verification
            const completeSignUp = await signUp.attemptEmailAddressVerification({
                code: values.code,
            })

            // If verification was completed, set the session to active
            // and redirect the user
            if (completeSignUp.status === 'complete') {
                await setActive({ session: completeSignUp.createdSessionId })
                router.push('/')
            } else {
                // If the status is not complete, check why. User may need to
                // complete further steps.
                console.error(JSON.stringify(completeSignUp, null, 2))
            }
        } catch (err: unknown) {
            reportError(err, 'failed to verify email address')

            // TODO Explore clerk docs for how to better handle error messages
            //  Currently unclear because signUp.attemptVerification method just 422s and doesnt return anything useful
            if (isClerkApiError(err)) {
                err.errors.forEach((error: ClerkAPIError) => {
                    verifyForm.setFieldError('code', error.longMessage)
                })
            }
        }
    }

    return (
        <Stack>
            <form onSubmit={verifyForm.onSubmit((values) => handleVerify(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Verify Your Email</Text>
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>We have emailed you a code, please enter that code here to finish signing up, thanks!</Text>
                    <TextInput
                        withAsterisk
                        label="Code"
                        placeholder="Enter verification code"
                        key={verifyForm.key('code')}
                        {...verifyForm.getInputProps('code')}
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Verify</Button>
                        <Anchor href="/">Already have an account? Sign In</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}

export function SignUp() {
    const { isLoaded, signUp } = useSignUp()
    const [verifying, setVerifying] = useState(false)
    const router = useRouter()

    const form = useForm<SignUpFormValues>({
        initialValues: {
            email: '',
            password: '',
            termsOfService: false,
        },

        validate: {
            email: isEmail('Invalid email'),
            password: isNotEmpty('Required'),
            termsOfService: isNotEmpty('You must accept terms of use'),
        },
    })

    if (!isLoaded) {
        // Add logic to handle loading state
        return <Loader />
    }

    if (verifying) {
        return <EmailVerificationStep />
    }

    if (signUp?.status === 'complete') {
        router.push('/')
    }

    const onSubmit = async (values: SignUpFormValues) => {
        if (!isLoaded) return

        try {
            await signUp.create({
                emailAddress: values.email,
                password: values.password,
            })

            await signUp.prepareEmailAddressVerification({
                strategy: 'email_code',
            })

            setVerifying(true)
        } catch (err: unknown) {
            reportError(err, 'failed to create signup')
            if (isClerkApiError(err)) {
                const emailError = err.errors.find((error) => error.meta?.paramName === 'email_address')
                if (emailError) {
                    form.setFieldError('email', emailError.longMessage)
                }
            }
        }
    }

    return (
        <Stack>
            <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Sign up to SafeInsights</Text>
                        <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Email"
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
                    <Checkbox
                        mt="md"
                        label="I agree to the terms of service"
                        key={form.key('termsOfService')}
                        {...form.getInputProps('termsOfService', {
                            type: 'checkbox',
                        })}
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Sign Up</Button>
                        <Anchor href="/">Already have an account? Sign In</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
