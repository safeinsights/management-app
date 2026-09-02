'use client'

import { PASSWORD_REQUIREMENTS, usePasswordRequirements } from '@/app/account/reset-password/password-requirements'
import { useForm, useMutation, useQuery, z, zodResolver } from '@/common'
import { CLERK_ERROR_COPY } from '@/components/clerk-errors'
import { handleMutationErrorsWithForm, InputError, reportError } from '@/components/errors'
import { useSignIn } from '@clerk/nextjs'
import {
    Alert,
    Button,
    Flex,
    Paper,
    PasswordInput,
    Text,
    TextInput,
    Title,
    useMantineTheme,
    Stack,
} from '@mantine/core'
import {
    AcknowledgementCheckbox,
    globalDocAgreementLabel,
    participationAgreementLabel,
    TosPnPreview,
} from '@/components/legal/signup-acknowledgement/acknowledgement-checkbox'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    fetchGlobalLegalDocumentsAction,
    fetchParticipationAgreementFromInviteIdAction,
} from '@/server/actions/legal-document.actions'
import { onCreateAccountAction, onPendingUserLoginAction } from '../create-account.action'
import { Routes } from '@/lib/routes'
import { markOrgJoined } from '@/lib/joined-org'

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
        // In the form so leaving it unchecked raises a visible error rather than only disabling
        // the button (OTTER-647). Stripped before the action.
        termsAccepted: z.literal(true, { message: 'You must accept the terms to continue' }),
        participationAccepted: z.literal(true, { message: 'You must accept the participation agreement to continue' }),
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

const LegalDocumentsError: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Alert color="red" title="There was an error loading the document">
            Reload the page to try again. Your invitation is still valid.
        </Alert>
    )
}

type InviteData = {
    inviteId: string
    email: string
    orgName: string
}

export const SetupAccountForm: FC<InviteData> = ({ inviteId, email, orgName }) => {
    const { setActive, signIn } = useSignIn()
    const theme = useMantineTheme()
    const router = useRouter()

    const form = useForm({
        validate: zodResolver(formSchema),
        validateInputOnBlur: true,
        validateInputOnChange: ['password'],
        initialValues: {
            firstName: '',
            lastName: '',
            password: '',
            confirmPassword: '',
            termsAccepted: false as true,
            participationAccepted: false as true,
        },
    })

    const [passwordTouched, setPasswordTouched] = useState(false)
    const { requirementsDescription } = usePasswordRequirements(form.values.password, passwordTouched)

    // Public: the form must show these before an account exists.
    const {
        data: tosPn = [],
        isPending: isLoadingTosPn,
        isError: tosPnError,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.globalDocuments(),
        queryFn: () => fetchGlobalLegalDocumentsAction(),
    })

    // Semi-public: the org's own ropa/dopa, gated by the invite's org. Null until one is published.
    const {
        data: participationAgreement = null,
        isPending: isPendingParticipationAgreement,
        isError: participationAgreementError,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.participationAgreementForInvite(inviteId),
        queryFn: () => fetchParticipationAgreementFromInviteIdAction({ inviteId }),
    })

    // An org with no participation agreement has nothing to tick, so the field satisfies itself once
    // the query has *loaded* a null.
    const hasParticipationAgreement = participationAgreement !== null
    useEffect(() => {
        if (isPendingParticipationAgreement || hasParticipationAgreement || participationAgreementError) return
        if (form.values.participationAccepted === true) return
        form.setFieldValue('participationAccepted', true as const)
    }, [isPendingParticipationAgreement, hasParticipationAgreement, participationAgreementError, form])

    const canSubmit =
        form.isValid() &&
        !isLoadingTosPn &&
        !tosPnError &&
        !isPendingParticipationAgreement &&
        !participationAgreementError

    const { mutate: createAccount, isPending: isCreating } = useMutation({
        mutationFn: ({ firstName, lastName, password }: FormValues) =>
            onCreateAccountAction({
                inviteId,
                form: { firstName, lastName, password },
                // The participation agreement is absent until the org publishes one
                acknowledgedVersionIds: [...tosPn, ...(participationAgreement ? [participationAgreement] : [])].map(
                    (document) => document.versionId,
                ),
            }),
        onError: handleMutationErrorsWithForm(form),
        async onSuccess(_, vals) {
            if (!signIn || !setActive) {
                reportError('unable to signin')
                return
            }

            try {
                const attempt = await signIn.create({
                    identifier: email,
                    password: vals.password,
                })

                if (attempt.status === 'complete') {
                    await setActive({ session: attempt.createdSessionId })
                    await onPendingUserLoginAction({ inviteId })
                    markOrgJoined(orgName)
                    router.push(Routes.accountMfa)
                } else if (attempt.status === 'needs_second_factor') {
                    // A fresh account has no MFA factors, so a second-factor challenge is
                    // unsatisfiable; Clerk's instance policy must let first sign-in complete.
                    reportError(
                        'Your account was created, but multi-factor authentication is required before you can sign in. Please contact your administrator.',
                    )
                } else {
                    console.error(
                        'Sign-in status:',
                        attempt.status,
                        'First factor:',
                        attempt.firstFactorVerification?.status,
                    )
                    reportError(`unable to sign in: ${attempt.status}`)
                }
            } catch (error) {
                console.error('Sign-in error:', error)
                reportError('sign in failed')
            }
        },
    })

    const clerkErrorCopy = CLERK_ERROR_COPY[String(form.errors.code)]
    const formErrorTitle = clerkErrorCopy?.title || 'Could not create account'
    const formErrorBody = clerkErrorCopy?.message || form.errors.form

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <form onSubmit={form.onSubmit((values) => createAccount(values))}>
                <Flex direction="column" gap="lg" maw={500} mx="auto" pb="xxl">
                    <Title mb="lg" order={3} ta="center">
                        Welcome to SafeInsights!
                    </Title>
                    <Text size="md">
                        You’ve been invited to join {orgName}. Please fill out the details below to create your account.
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
                        onBlur={(event) => {
                            form.getInputProps('password').onBlur?.(event)
                            setPasswordTouched(true)
                        }}
                        // Suppressed in favor of the requirements list below.
                        error={undefined}
                        aria-invalid={!!form.errors.password || undefined}
                        // Rendered as the description so Mantine owns the aria-describedby wiring.
                        description={requirementsDescription}
                        // Below the input, not Mantine's default above: this is live validation
                        // feedback.
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                    />

                    <PasswordInput
                        radius="sm"
                        label="Confirm password"
                        key={form.key('confirmPassword')}
                        placeholder="********"
                        {...form.getInputProps('confirmPassword')}
                        error={form.errors.confirmPassword && <InputError error={form.errors.confirmPassword} />}
                        // PasswordInput's inner <input> has withAria disabled, so `error` alone
                        // never marks it invalid to assistive tech (OTTER-647).
                        aria-invalid={!!form.errors.confirmPassword || undefined}
                    />

                    {form.errors.form && (
                        <Alert
                            color="red"
                            title={formErrorTitle}
                            withCloseButton
                            onClose={() => form.clearFieldError('form')}
                        >
                            {formErrorBody}
                        </Alert>
                    )}

                    <Stack>
                        <LegalDocumentsError isVisible={tosPnError} />
                        <TosPnPreview documents={tosPn} />
                        <AcknowledgementCheckbox
                            label={globalDocAgreementLabel(tosPn)}
                            checked={form.values.termsAccepted}
                            onChange={(checked) => form.setFieldValue('termsAccepted', checked as true)}
                            onBlur={() => form.validateField('termsAccepted')}
                            error={form.errors.termsAccepted}
                        />
                        <LegalDocumentsError isVisible={participationAgreementError} />
                        <AcknowledgementCheckbox
                            label={participationAgreementLabel(participationAgreement)}
                            checked={form.values.participationAccepted}
                            onChange={(checked) => form.setFieldValue('participationAccepted', checked as true)}
                            onBlur={() => form.validateField('participationAccepted')}
                            error={form.errors.participationAccepted}
                        />
                    </Stack>

                    <Flex mt="sm">
                        <Button
                            type="submit"
                            loading={isCreating}
                            disabled={!canSubmit}
                            w="100%"
                            size="lg"
                            bg={!canSubmit ? 'grey.1' : undefined}
                            styles={!canSubmit ? { label: { color: theme.colors.grey[7] } } : undefined}
                        >
                            Create Account
                        </Button>
                    </Flex>
                </Flex>
            </form>
        </Paper>
    )
}
