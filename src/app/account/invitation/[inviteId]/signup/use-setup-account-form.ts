'use client'

import { PASSWORD_REQUIREMENTS, usePasswordRequirements } from '@/app/account/reset-password/password-requirements'
import { useForm, useMutation, useQuery, z, zodResolver } from '@/common'
import { CLERK_ERROR_COPY } from '@/components/clerk-errors'
import { handleMutationErrorsWithForm, reportError } from '@/components/errors'
import { useSignIn } from '@clerk/nextjs/legacy'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchGlobalLegalDocumentsAction } from '@/server/actions/legal-acknowledgement.actions'
import { fetchParticipationAgreementFromInviteIdAction } from '@/server/actions/participation-agreement.actions'
import { onCreateAccountAction, onPendingUserLoginAction } from '@/server/actions/create-account.actions'
import { Routes } from '@/lib/routes'
import { markOrgJoined } from '@/lib/joined-org'

const baseSchema = z.object({
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
    // In the form so leaving one unchecked raises a visible error rather than only disabling the
    // button (OTTER-647). Stripped before the action.
    termsAccepted: z.boolean(),
    participationAccepted: z.boolean(),
})

type FormValues = z.infer<typeof baseSchema>

// The participation tick is only owed when the invite's org has published an agreement: with none,
// AcknowledgementCheckbox renders nothing, so requiring it would be unsatisfiable.
const formSchemaFor = (isParticipationRequired: boolean) =>
    baseSchema.superRefine(({ password, confirmPassword, termsAccepted, participationAccepted }, ctx) => {
        if (confirmPassword !== password) {
            ctx.addIssue({
                code: 'custom',
                message: 'Passwords do not match. Please re-enter them.',
                path: ['confirmPassword'],
            })
        }
        if (!termsAccepted) {
            ctx.addIssue({ code: 'custom', message: 'You must accept the terms to continue', path: ['termsAccepted'] })
        }
        if (isParticipationRequired && !participationAccepted) {
            ctx.addIssue({
                code: 'custom',
                message: 'You must accept the participation agreement to continue',
                path: ['participationAccepted'],
            })
        }
    })

export type InviteData = {
    inviteId: string
    email: string
    orgName: string
}

export function useSetupAccountForm({ inviteId, email, orgName }: InviteData) {
    const { setActive, signIn } = useSignIn()
    const router = useRouter()

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

    // Fail closed: only a loaded, error-free null means there is genuinely nothing to acknowledge.
    const isParticipationRequired =
        isPendingParticipationAgreement || participationAgreementError || participationAgreement !== null
    const schema = useMemo(() => formSchemaFor(isParticipationRequired), [isParticipationRequired])

    const form = useForm<FormValues>({
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        validateInputOnChange: ['password'],
        initialValues: {
            firstName: '',
            lastName: '',
            password: '',
            confirmPassword: '',
            termsAccepted: false,
            participationAccepted: false,
        },
    })

    const [passwordTouched, setPasswordTouched] = useState(false)
    const { requirementsDescription } = usePasswordRequirements(form.values.password, passwordTouched)

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

    return {
        form,
        tosPn,
        tosPnError,
        participationAgreement,
        participationAgreementError,
        canSubmit,
        isCreating,
        createAccount,
        requirementsDescription,
        markPasswordTouched: () => setPasswordTouched(true),
        formError: {
            isVisible: Boolean(form.errors.form),
            title: clerkErrorCopy?.title || 'Could not create account',
            body: clerkErrorCopy?.message || form.errors.form,
            onClose: () => form.clearFieldError('form'),
        },
    }
}
