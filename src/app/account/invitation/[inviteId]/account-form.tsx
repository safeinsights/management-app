'use client'

import { Flex, Button, TextInput, PasswordInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { FC, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { onCreateAccountAction, onPendingUserLoginAction } from './create-account.action'
import { Title } from '@mantine/core'
import { z } from 'zod'
import { zodResolver } from 'mantine-form-zod-resolver'
import { handleMutationErrorsWithForm } from '@/components/errors'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { SuccessPanel } from '@/components/panel'
import { useRouter } from 'next/navigation'
import { SignOutPanel } from './signout-panel'
import { LoadingMessage } from '@/components/loading'

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

const SetupAccountForm: FC<InviteProps & { onComplete(): void }> = ({ inviteId, email, onComplete }) => {
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
