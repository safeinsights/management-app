'use client'

import { useState } from 'react'
import { reportError, isClerkApiError } from './errors'
import { IconX, IconCheck } from '@tabler/icons-react'
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
    Container,
    NativeSelect,
    Progress,
    Popover,
} from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignUp } from '@clerk/nextjs'
import { ClerkAPIError } from '@clerk/types'

interface SignUpFormValues {
    email: string
    password: string
    confirmPassword: string
    firstName: string
    lastName: string
    title: string
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
    //Password Validation/Confirmation
    function PasswordRequirement({ meets, label }: { meets: boolean; label: string }) {
        return (
            <Text c={meets ? 'teal' : 'red'} style={{ display: 'flex', alignItems: 'center' }} mt={7} size="sm">
                {meets ? <IconCheck size={14} /> : <IconX size={14} />}
                <span style={{ marginLeft: 10 }}>{label}</span>
            </Text>
        )
    }
    function getStrength(password: string) {
        let multiplier = password.length > 5 ? 0 : 1

        requirements.forEach((requirement) => {
            if (!requirement.re.test(password)) {
                multiplier += 1
            }
        })

        return Math.max(100 - (100 / (requirements.length + 1)) * multiplier, 10)
    }

    const requirements = [
        { re: /[0-9]/, label: 'Includes number' },
        { re: /[a-z]/, label: 'Includes lowercase letter' },
        { re: /[A-Z]/, label: 'Includes uppercase letter' },
        { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: 'Includes special character' },
    ]

    const [popoverOpened, setPopoverOpened] = useState(false)
    const [value, setValue] = useState('')
    const checks = requirements.map((requirement, index) => (
        <PasswordRequirement key={index} label={requirement.label} meets={requirement.re.test(value)} />
    ))

    const strength = getStrength(value)
    const color = strength === 100 ? 'teal' : strength > 50 ? 'yellow' : 'red'

    const { isLoaded, signUp } = useSignUp()
    const [verifying, setVerifying] = useState(false)
    const router = useRouter()

    const form = useForm<SignUpFormValues>({
        initialValues: {
            firstName: '',
            lastName: '',
            email: '',
            password: '',
            confirmPassword: '',
            title: '',
            termsOfService: false,
        },

        validate: {
            email: isEmail('Invalid email'),
            firstName: (value) => {
                if (!value) return 'First name is required';
                if (value.length < 2) return 'First name must be at least 2 characters';
                if (value.length > 100) return 'First name must be at most 100 characters';
                return null;
              },
              lastName: (value) => {
                if (!value) return 'Last name is required';
                if (value.length < 2) return 'Last name must be at least 2 characters';
                if (value.length > 100) return 'Last name must be at most 100 characters';
                return null;
              },
            password: isNotEmpty('Password is required'),
            confirmPassword: (value, allValues) => {
                if (value !== allValues.password) {
                    return 'Passwords do not match'
                }
                return null
            },
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
                firstName: values.firstName,
                lastName: values.lastName,
                /* TODO:a custom 'Title' field will need to be enabled in clerk
                customAttributes: {
                    title: values.title,
                },*/
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
        <Container w="80%">
            <Stack>
                <form onSubmit={form.onSubmit((values) => onSubmit(values))}>
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                        <Group justify="space-between" gap="xl">
                            <Text ta="left">Sign up to SafeInsights</Text>
                            <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
                        </Group>
                    </Paper>
                    <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                        <NativeSelect
                            mt={20}
                            key={form.key('title')}
                            {...form.getInputProps('title')}
                            label="Title"
                            data={[
                                '',
                                'Dr.',
                                'Prof.',
                                'Rev.',
                                'Hon.',
                                'Mr.',
                                'Mrs.',
                                'Ms.',
                                'Sir',
                                'Dame',
                                'Lord',
                                'Lady',
                            ]}
                        />
                        <TextInput
                            mt={20}
                            key={form.key('firstName')}
                            {...form.getInputProps('firstName')}
                            label="First Name"
                            placeholder="First name"
                            aria-label="First Name"
                            withAsterisk
                        />
                        <TextInput
                            mt={20}
                            key={form.key('lastName')}
                            {...form.getInputProps('lastName')}
                            label="Last Name"
                            placeholder="Last Name"
                            aria-label="Last Name"
                            withAsterisk
                        />
                        <TextInput
                            mt={20}
                            //TODO: Pull in email from signup link
                            // key={form.key('email')}
                            // {...form.getInputProps('email')}
                            label="Email"
                            placeholder="Email address will be autopopulated from signup link"
                            aria-label="Email"
                            disabled
                        />
                        <Popover
                            opened={popoverOpened}
                            position="bottom"
                            width="target"
                            transitionProps={{ transition: 'pop' }}
                        >
                            <Popover.Target>
                                <div
                                    onFocusCapture={() => setPopoverOpened(true)}
                                    onBlurCapture={() => setPopoverOpened(false)}
                                >
                                    <PasswordInput
                                        mt={20}
                                        withAsterisk
                                        key={form.key('password')}
                                        {...form.getInputProps('password')}
                                        label="Password"
                                        placeholder="Password"
                                        aria-label="Password"
                                        value={value}
                                        onChange={(event) => setValue(event.currentTarget.value)}
                                    />
                                </div>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <Progress color={color} value={strength} size={5} mb="xs" />
                                <PasswordRequirement label="Includes at least 8 characters" meets={value.length > 8} />
                                {checks}
                            </Popover.Dropdown>
                        </Popover>
                        <PasswordInput
                            label="Confirm Password"
                            placeholder="Confirm Password"
                            withAsterisk
                            key={form.key('confirmPassword')}
                            {...form.getInputProps('confirmPassword')}
                            mt="md"
                        />
                        <Checkbox
                            mt={20}
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
        </Container>
    )
}
