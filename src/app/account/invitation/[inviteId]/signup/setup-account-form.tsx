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
} from '@/components/legal/signup-acknowledegment/acknowledgement-checkbox'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    fetchGlobalLegalDocumentsAction,
    fetchParticipationAgreementFromInviteIdAction,
    ParticipationData,
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
        // In the form so leaving it unchecked raises a visible error rather than only
        // disabling the button (OTTER-647). Stripped before the action, whose schema
        // has no such field.
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

// Account creation is held until the documents load: the checkbox falls back to placeholder copy
// when they are missing, and a tick against that is not evidence of agreeing to anything published.
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

    // Public: the form has to show these before an account exists. Empty until the first Terms of
    // Service and Privacy Notice are published, which AcknowledgementCheckbox renders as placeholder copy.
    const {
        data: tosPn = [],
        isPending: isLoadingTosPn,
        isError: tosPnError,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.globalDocuments(),
        queryFn: () => fetchGlobalLegalDocumentsAction(),
    })

    // Semi-public: ROPA or DOPA must also be shown before account exists.
    // Empty until published. Gated by org.
    const emptyData: ParticipationData = { versionId: '', type: 'ROPA', url: null } // todo: guard against null by setting initial value
    const {
        data: participationAgreement = emptyData,
        isPending: isPendingParticipationAgreement,
        isError: participationAgreementError,
    } = useQuery({
        queryKey: ['participationAgreement', inviteId],
        queryFn: () => fetchParticipationAgreementFromInviteIdAction({ inviteId }),
    })

    // An org with no published ropa/dopa renders no participation checkbox (participationAgreementLabel
    // returns null), so the invitee has nothing to tick. Mark the absent requirement satisfied rather
    // than leaving Create Account disabled against a box that never appears. When an agreement exists
    // the box renders and the tick is required as normal.
    const hasParticipationAgreement = Boolean(participationAgreement.url)

    useEffect(() => {
        if (isPendingParticipationAgreement || hasParticipationAgreement) return
        if (form.values.participationAccepted === true) return
        form.setFieldValue('participationAccepted', true as const)
    }, [isPendingParticipationAgreement, hasParticipationAgreement, form])

    // Submitting before the documents arrive, or after they failed to, falls back to the "Once
    // implemented" placeholder — copy that contradicts what is published, under a ticked box.
    const canSubmit =
        form.isValid() &&
        !isLoadingTosPn &&
        !tosPnError &&
        !isPendingParticipationAgreement &&
        !participationAgreementError

    const { mutate: createAccount, isPending: isCreating } = useMutation({
        // confirmPassword and termsAccepted are client-side concerns; the action's schema has
        // neither, so only the fields it actually uses are sent.
        mutationFn: ({ firstName, lastName, password }: FormValues) =>
            onCreateAccountAction({
                inviteId,
                form: { firstName, lastName, password },
                // filter(Boolean) drops the empty id the participation placeholder carries when the
                // org has no published agreement — the action validates each id as a uuid, so '' would
                // fail the whole submission.
                acknowledgedVersionIds: [...tosPn, participationAgreement]
                    .map((document) => document.versionId)
                    .filter(Boolean),
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
                    // A freshly-created account has no MFA factors enrolled, so a second-factor
                    // challenge here is unsatisfiable — handing this state to <RequestMFA> would
                    // strand the user on the "No MFA factors are configured" dead-end screen.
                    // The instance-level Clerk MFA policy must allow first sign-in to complete
                    // so the user can reach /account/mfa to enroll.
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
                        // Error is suppressed in favor of the requirements list below, which
                        // now also appears when the field is left empty.
                        error={undefined}
                        aria-invalid={!!form.errors.password || undefined}
                        // Rendered as the input's description so Mantine owns the
                        // aria-describedby wiring; a hand-passed value is overwritten.
                        description={requirementsDescription}
                        // Description below the input, not Mantine's default position above it:
                        // this is live validation feedback, and it sat under the field before.
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                    />

                    <PasswordInput
                        radius="sm"
                        label="Confirm password"
                        key={form.key('confirmPassword')}
                        placeholder="********"
                        {...form.getInputProps('confirmPassword')}
                        error={form.errors.confirmPassword && <InputError error={form.errors.confirmPassword} />}
                        // PasswordInput's inner <input> is rendered with withAria disabled, so
                        // `error` alone never marks it invalid to assistive tech (OTTER-647).
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
