'use client'

import {
    PASSWORD_REQUIREMENTS,
    Requirements,
    usePasswordRequirements,
} from '@/app/account/reset-password/password-requirements'
import { z, zodResolver } from '@/components/common'
import { handleMutationErrorsWithForm, InputError } from '@/components/errors'
import { LoadingMessage } from '@/components/loading'
import { SuccessPanel } from '@/components/panel'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { Alert, Button, Flex, PasswordInput, Text, TextInput, useMantineTheme } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { FC, use } from 'react'
import { getOrgInfoForInviteAction, onCreateAccountAction, onPendingUserLoginAction } from '../create-account.action'

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

type InviteData = {
    inviteId: string
    email: string
    orgName: string
}

const SetupAccountForm: FC<InviteData> = ({ inviteId, email, orgName }) => {
    const { setActive, signIn } = useSignIn()
    const theme = useMantineTheme()
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
                await setActive({ session: attempt.createdSessionId })
                await onPendingUserLoginAction({ inviteId })
            } else {
                reportError('unable to sign in')
            }
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => createAccount(values))}>
            <Flex direction="column" gap="lg" maw={500} mx="auto" pb="xxl">
                <Text size="md">
                    You&apos;ve been invited to join {orgName}. Please fill out the details below to create your
                    account.
                </Text>
                <TextInput
                    label="Email"
                    radius="sm"
                    value={email}
                    disabled
                    c="charcoal.9"
                    styles={{
                        input: {
                            backgroundColor: theme.colors.charcoal[1],
                            borderColor: theme.colors.charcoal[1],
                            color: theme.colors.charcoal[9],
                        },
                    }}
                />

                <Flex direction="row" gap="xl">
                    <TextInput
                        radius="sm"
                        flex="1"
                        key={form.key('firstName')}
                        {...form.getInputProps('firstName')}
                        label="First name"
                        placeholder="Enter your first name"
                        error={form.errors.firstName && <InputError error={form.errors.firstName} />}
                    />

                    <TextInput
                        radius="sm"
                        flex="1"
                        key={form.key('lastName')}
                        {...form.getInputProps('lastName')}
                        label="Last name"
                        placeholder="Enter your last name"
                        error={form.errors.lastName && <InputError error={form.errors.lastName} />}
                    />
                </Flex>
                <PasswordInput
                    radius="sm"
                    label="Enter password"
                    key={form.key('password')}
                    placeholder="********"
                    {...form.getInputProps('password')}
                    error={undefined} // prevent the password input from showing an error in favor of the custom requirements below
                />

                {shouldShowRequirements && <Requirements requirements={requirements} />}

                <PasswordInput
                    radius="sm"
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
                    <Button
                        type="submit"
                        loading={isCreating}
                        disabled={!form.isValid()}
                        w="100%"
                        size="lg"
                        bg="grey.1"
                        styles={{ label: { color: theme.colors.grey[7] } }}
                    >
                        Create Account
                    </Button>
                </Flex>
            </Flex>
        </form>
    )
}

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

const SignupAccountPanel: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const { isLoaded: isLoadedAuth, isSignedIn } = useAuth()

    const { data, isLoading: isLoadingData } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    if (!isLoadedAuth || isLoadingData || !data) return <LoadingMessage message="Loading" />

    return isSignedIn ? <Success /> : <SetupAccountForm inviteId={inviteId} orgName={data.name} {...data} />
}

export default SignupAccountPanel
