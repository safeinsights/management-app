'use client'

import { errorToString } from '@/lib/errors'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { useMutation } from '@/common'
import { isEmail, useForm } from '@mantine/form'
import { ResetFormValues, ResetFormView } from './reset-form-view'

interface ResetFormProps {
    onCompleteAction: (_reset: SignInResource) => void
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
            if (!signIn) return
            return await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: form.email,
            })
        },
        onError(error: unknown) {
            // If Clerk returns email not found, do not show an error
            const message = errorToString(error)
            if (message.includes('find your account')) {
                onCompleteAction({} as SignInResource)
                return
            }
            emailForm.setErrors({ email: message })
        },
        onSuccess(info?: SignInResource) {
            if (info) {
                onCompleteAction(info)
            } else {
                // clerk did not throw an error but also did not return a signIn object
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
