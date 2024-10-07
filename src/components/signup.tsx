import { Anchor, Button, Checkbox, Group, Loader, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useSignUp } from '@clerk/nextjs'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { reportError } from '@/components/errors'
import { ClerkAPIError } from '@clerk/types'
import Link from 'next/link'

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
        } catch (err: any) {
            reportError(err, 'failed to verify email address')

            // TODO Explore clerk docs for how to better handle error messages
            //  Currently unclear because signUp.attemptVerification method just 422s and doesnt return anything useful
            if (err.errors?.length) {
                err.errors.forEach((error: ClerkAPIError) => {
                    verifyForm.setFieldError('code', error.longMessage)
                })
            }
        }
    }

    return (
        <Stack>
            <Text>We have emailed you a code, please enter that code here to finish signing up, thanks!</Text>
            <form onSubmit={verifyForm.onSubmit((values) => handleVerify(values))}>
                <TextInput
                    withAsterisk
                    label="Code"
                    key={verifyForm.key('code')}
                    {...verifyForm.getInputProps('code')}
                />

                <Group justify="flex-end" mt="md">
                    <Button type="submit">Submit</Button>
                </Group>
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
        } catch (err: any) {
            reportError(err, 'failed to create signup')

            const emailError = err.errors?.find((error: any) => error.meta?.paramName === 'email_address')
            if (emailError) {
                form.setFieldError('email', emailError.longMessage)
            }
        }
    }

    return (
        <Stack>
            <Title order={3}>Signup</Title>

            <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
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

                <Checkbox
                    mt="md"
                    label="I agree to the terms of service"
                    key={form.key('termsOfService')}
                    {...form.getInputProps('termsOfService', {
                        type: 'checkbox',
                    })}
                />

                <Anchor href="/reset-password">Forgot your password? Reset it here!</Anchor>

                <Group justify="flex-end" mt="md">
                    <Button type="submit">Submit</Button>
                </Group>
            </form>
        </Stack>
    )
}
