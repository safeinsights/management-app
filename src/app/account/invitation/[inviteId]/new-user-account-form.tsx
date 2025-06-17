/**
 * This file defines the user interface for a new user accepting an invitation.
 * It acts as a controller that displays either an account creation form (`SetupAccountForm`)
 * or a success message (`Success`) upon completion.
 *
 * This component is rendered by `InvitationHandler` only when a user is new and not authenticated.
 */
'use-client'

import { Flex, Button, TextInput, PasswordInput } from '@mantine/core'
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

const formSchema = z.object({
    firstName: z.string().trim().nonempty('cannot be left blank'),
    lastName: z.string().trim().nonempty('cannot be left blank'),
    password: z.string().trim().min(8, 'must be at least 8 characters'),
})

type FormValues = z.infer<typeof formSchema>
type InviteProps = {
    inviteId: string
    email: string
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
        initialValues: {
            firstName: '',
            lastName: '',
            password: '',
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
            <Title order={3} mb="md" ta="center">
                Enter the below information to configure your account
            </Title>

            <Flex direction="column" gap="lg" w={500} mx="auto">
                <TextInput key={form.key('firstName')} {...form.getInputProps('firstName')} label="First Name" />

                <TextInput key={form.key('lastName')} {...form.getInputProps('lastName')} label="Last Name" />

                <PasswordInput
                    withAsterisk
                    label="Password"
                    key={form.key('password')}
                    {...form.getInputProps('password')}
                />

                <Flex justify="flex-end" mt={15}>
                    <Button type="submit" loading={isCreating}>
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
