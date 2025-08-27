'use client'

import {
    PASSWORD_REQUIREMENTS,
    Requirements,
    usePasswordRequirements,
} from '@/app/account/reset-password/password-requirements'
import { useForm, useMutation, useState, z, zodResolver, type FC } from '@/components/common'
import { handleMutationErrorsWithForm, InputError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import { SuccessPanel } from '@/components/panel'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { Alert, Button, Flex, Group, PasswordInput, Text, TextInput } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { onCreateAccountAction, onPendingUserLoginAction } from './create-account.action'
import { SignOutPanel } from './signout-panel'

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

    const { requirements, shouldShowRequirements } = usePasswordRequirements(form.values.password)

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
                await onPendingUserLoginAction({ inviteId })
            } else {
                reportError('unable to sign in')
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

                {shouldShowRequirements && <Requirements requirements={requirements} />}

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
