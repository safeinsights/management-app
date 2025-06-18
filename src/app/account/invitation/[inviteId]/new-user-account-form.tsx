/**
 * This file defines the user interface for a new user accepting an invitation.
 * It acts as a controller that displays either an account creation form (`SetupAccountForm`)
 * or a success message (`Success`) upon completion.
 *
 * This component is rendered by `InvitationHandler` only when a user is new and not authenticated.
 */
'use-client'

import { Flex, Button, TextInput, PasswordInput, Text, Group, Alert } from '@mantine/core'
import { useForm } from '@mantine/form'
import { FC, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { onCreateAccountAction } from '@/server/actions/invite.actions'
import { Title } from '@mantine/core'
import { z } from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { handleMutationErrorsWithForm, reportError } from '@/components/errors'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { SuccessPanel } from '@/components/panel'
import { useRouter } from 'next/navigation'
import { LoadingMessage } from '@/components/loading'
import { InputError } from '@/components/errors'
import { PASSWORD_REQUIREMENTS, Requirements } from '@/app/account/reset-password/password-requirements'

const Success: FC<{ inviteId: string }> = ({ inviteId }) => {
    const router = useRouter()

    const onContinue = () => {
        // Redirect to generic MFA page with inviteId in query params
        router.push(`/account/mfa/app?inviteId=${inviteId}`)
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
        password: (() => {
            let schema = z.string().max(64)
            PASSWORD_REQUIREMENTS.forEach((req) => {
                schema = schema.regex(req.re, req.message)
            })
            return schema
        })(),
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

// Storing clerkUserId temporarily to pass to Success component
type SetupAccountFormState = {
    clerkUserId: string | null
}

const SetupAccountForm: FC<InviteProps & { onComplete: (clerkUserId: string) => void }> = ({
    inviteId,
    email,
    onComplete,
}) => {
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
        mutationFn: (formData: FormValues) => onCreateAccountAction({ inviteId, email, form: formData }), // Pass email
        onError: handleMutationErrorsWithForm(form),
        async onSuccess(clerkUserId, vals) {
            // clerkUserId is returned by onCreateAccountAction
            if (!signIn) {
                reportError('SignIn not available post account creation')
                return
            }
            const attempt = await signIn.create({
                identifier: email,
                password: vals.password,
            })
            if (attempt.status === 'complete') {
                await setActive({ session: attempt.createdSessionId })
                onComplete(clerkUserId) // Pass clerkUserId to parent to trigger Success panel
            } else {
                reportError(
                    new Error(`Sign-in attempt not complete: ${attempt.status}`),
                    'unable to sign in after account creation',
                )
            }
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => createAccount(values))}>
            <Flex direction="column" gap="lg" maw={500} mx="auto">
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
                    const requirements = PASSWORD_REQUIREMENTS.map((req) => ({
                        ...req,
                        meets: req.re.test(form.values.password),
                    }))

                    const allMet = requirements.every((r) => r.meets)

                    if (!(form.values.password || form.errors.password) || allMet) return null

                    return <Requirements requirements={requirements} />
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

export const NewUserAccountForm: FC<InviteProps> = (props) => {
    const [formCompletedState, setFormCompletedState] = useState<SetupAccountFormState>({ clerkUserId: null })
    const { isLoaded } = useAuth()

    if (!isLoaded) return <LoadingMessage message="Loading" />

    return formCompletedState.clerkUserId ? (
        <Success inviteId={props.inviteId} />
    ) : (
        <SetupAccountForm {...props} onComplete={(clerkUserId) => setFormCompletedState({ clerkUserId })} />
    )
}
