'use client'

import { errorToString } from '@/lib/errors'
import { useSignIn } from '@clerk/nextjs'
import { useForm, useMutation } from '@/common'
import { isEmail } from '@mantine/form'
import { throwOnClerkError } from '../signin/logic'
import { ResetFormValues, ResetFormView } from './reset-form-view'

interface ResetFormProps {
    onCompleteAction: (identifier: string | null) => void
}

export function ResetForm({ onCompleteAction }: ResetFormProps) {
    const { signIn } = useSignIn()

    const emailForm = useForm<ResetFormValues>({
        initialValues: {
            email: '',
        },
        validate: {
            email: isEmail('Invalid email'),
        },
    })

    const { isPending, mutate: onSubmitEmail } = useMutation({
        async mutationFn(form: ResetFormValues) {
            await throwOnClerkError(signIn.create({ identifier: form.email }))
            await throwOnClerkError(signIn.resetPasswordEmailCode.sendCode())
            return form.email
        },
        onError(error: unknown) {
            // Clerk reporting email-not-found must not confirm whether an address is registered.
            const message = errorToString(error)
            if (message.includes('find your account')) {
                onCompleteAction(null)
                return
            }
            emailForm.setErrors({ email: message })
        },
        onSuccess(email?: string) {
            if (email) {
                onCompleteAction(email)
            } else {
                emailForm.setErrors({
                    email: 'An unknown error occurred, please try again later.',
                })
            }
        },
    })

    return (
        <ResetFormView
            form={emailForm}
            onSubmit={emailForm.onSubmit((values) => onSubmitEmail(values))}
            isPending={isPending}
        />
    )
}
