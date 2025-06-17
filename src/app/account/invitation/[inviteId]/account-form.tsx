'use client'

import { Flex, Button, TextInput, PasswordInput, Text, Group, SimpleGrid, Alert } from '@mantine/core'
import { useForm } from '@mantine/form'
import { FC, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { onCreateAccountAction, onPendingUserLoginAction } from './create-account.action'
import { z } from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { handleMutationErrorsWithForm } from '@/components/errors'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { SuccessPanel } from '@/components/panel'
import { useRouter } from 'next/navigation'
import { SignOutPanel } from './signout-panel'
import { LoadingMessage } from '@/components/loading'
import { InputError } from '@/components/errors'
import { CheckCircle, XCircle } from '@phosphor-icons/react'

const Success: FC = () => {
    const router = useRouter()

    const onContinue = () => {
        router.push('/account/mfa')
    }
    return (
        <SuccessPanel title="Your account has been created successfully!" onContinue={onContinue}>
            Next, secure your account with MFA
        </SuccessPanel>
    )
}

const formSchema = z
    .object({
        firstName: z.string().min(2, 'Name must be 2-50 characters').max(50, 'Name must be 2-50 characters'),
        lastName: z.string().min(2, 'Name must be 2-50 characters').max(50, 'Name must be 2-50 characters'),
        password: z
            .string()
            .min(8, '8 character minimum')
            .max(64)
            .refine((val) => /[0-9]/.test(val), 'One number')
            .refine((val) => /[A-Z]/.test(val), 'One uppercase letter')
            .refine((val) => /[^A-Za-z0-9]/.test(val), 'One special character *&^'),
        confirmPassword: z.string(),
    })
    .superRefine(({ confirmPassword, password }, ctx) => {
        if (confirmPassword !== password) {
            ctx.addIssue({
                code: 'custom',
                message: 'Passwords do not match. Please re-enter them.',
                path: ['confirmPassword'],
            })
        }
    })

type FormValues = z.infer<typeof formSchema>
type InviteProps = {
    inviteId: string
    email: string
    orgName: string
}

const Requirement: FC<{ meets: boolean; label: string }> = ({ meets, label }) => {
    const Icon = meets ? CheckCircle : XCircle
    return (
        <Group gap="xs" align="center">
            <Icon size={16} color={meets ? 'green' : 'red'} />
            <Text size="sm" fw={400}>
                {label}
            </Text>
        </Group>
    )
}

const SetupAccountForm: FC<InviteProps & { onComplete(): void }> = ({ inviteId, email, orgName, onComplete }) => {
    const { setActive, signIn } = useSignIn()

    const form = useForm({
        validate: zodResolver(formSchema),
        validateInputOnBlur: true,
        validateInputOnChange: ['password'],
        initialValues: {
            firstName: '',
            lastName: '',
            password: '',
            confirmPassword: '',
        },
    })

    const { mutate: createAccount, isPending: isCreating } = useMutation({
        mutationFn: (form: FormValues) => onCreateAccountAction({ inviteId, form }),
        onError: handleMutationErrorsWithForm(form),
        async onSuccess(_, vals) {
            if (!signIn) {
                reportError('unable to signin')
                return
            }

            const attempt = await signIn.create({
                identifier: email,
                password: vals.password,
            })

            if (attempt.status === 'complete') {
                onComplete()
                await setActive({ session: attempt.createdSessionId })
                await onPendingUserLoginAction(inviteId)
            } else {
                reportError('unable to sign in')
            }
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => createAccount(values))}>
            <Flex direction="column" gap="lg" w={500} mx="auto">
                <Text size="md">
                    You&apos;ve been invited to join {orgName}. Please fill out the details below to create your
                    account.
                </Text>
                <TextInput label="Email" value={email} disabled />

                <Group grow gap="md">
                    <TextInput
                        key={form.key('firstName')}
                        {...form.getInputProps('firstName')}
                        label="First name"
                        placeholder="Enter your first name"
                        error={form.errors.firstName && <InputError error={form.errors.firstName} />}
                    />

                    <TextInput
                        key={form.key('lastName')}
                        {...form.getInputProps('lastName')}
                        label="Last name"
                        placeholder="Enter your last name"
                        error={form.errors.lastName && <InputError error={form.errors.lastName} />}
                    />
                </Group>
                <PasswordInput
                    label="Enter password"
                    key={form.key('password')}
                    placeholder="********"
                    {...form.getInputProps('password')}
                    error={undefined} // prevent the password input from showing an error in favor of the custom requirements below
                />

                {(() => {
                    const lengthMet = form.values.password.length >= 8
                    const numberMet = /[0-9]/.test(form.values.password)
                    const upperMet = /[A-Z]/.test(form.values.password)
                    const specialMet = /[^A-Za-z0-9]/.test(form.values.password)
                    const allMet = lengthMet && numberMet && upperMet && specialMet

                    if (!(form.values.password || form.errors.password) || allMet) return null

                    return (
                        <SimpleGrid cols={2} spacing={4}>
                            <Requirement meets={lengthMet} label="8 character minimum" />
                            <Requirement meets={numberMet} label="One number" />
                            <Requirement meets={upperMet} label="One uppercase letter" />
                            <Requirement meets={specialMet} label="One special character *&^" />
                        </SimpleGrid>
                    )
                })()}

                <PasswordInput
                    label="Confirm password"
                    key={form.key('confirmPassword')}
                    placeholder="********"
                    {...form.getInputProps('confirmPassword')}
                    error={form.errors.confirmPassword && <InputError error={form.errors.confirmPassword} />}
                />

                {form.errors.form && (
                    <Alert
                        color="red"
                        title="Compromised Password"
                        withCloseButton
                        onClose={() => form.clearFieldError('form')}
                    >
                        {form.errors.form}
                    </Alert>
                )}

                <Flex mt="sm">
                    <Button type="submit" loading={isCreating} disabled={!form.isValid()} w="100%" size="md">
                        Create Account
                    </Button>
                </Flex>
            </Flex>
        </form>
    )
}

export const AccountPanel: FC<InviteProps> = (props) => {
    const [inviteCompleted, setInviteCompleted] = useState(false)

    const { isLoaded, isSignedIn } = useAuth()

    if (!isLoaded) return <LoadingMessage message="Loading" />

    if (!inviteCompleted && isSignedIn == true) {
        return <SignOutPanel />
    }

    return inviteCompleted && isSignedIn ? (
        <Success />
    ) : (
        <SetupAccountForm {...props} onComplete={() => setInviteCompleted(true)} />
    )
}
