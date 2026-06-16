import { useForm, zodResolver } from '@/common'
import { reportError } from '@/components/errors'
import { clerkErrorOverrides, errorToString } from '@/lib/errors'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { actionResult, safeRedirectUrl } from '@/lib/utils'
import { onUserSignInAction } from '@/server/actions/user.actions'
import { useAuth, useSignIn, useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { z } from 'zod'
import { type MFAState } from './logic'
import { SignInFormView } from './sign-in-form-view'

const signInSchema = z.object({
    email: z.string().min(1, 'Email is required').max(250, 'Email too long').email('Invalid email'),
    password: z.string().min(1, 'Required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export const SignInForm: FC<{
    mfa: MFAState
    onComplete: (state: MFAState) => Promise<void>
}> = ({ mfa, onComplete }) => {
    const { signOut, getToken } = useAuth()
    const [signedInRecently, setSignedInRecently] = useState(false)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const { setActive, signIn } = useSignIn()
    const { isSignedIn } = useUser()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [clerkError, setClerkError] = useState<{ title: string; message: string } | null>(null)

    useEffect(() => {
        if (searchParams.get('invite_not_found')) {
            // TODO: investigate if this is an issue, disable was added during upgrading eslint which pointed out possible errors
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setClerkError({
                title: 'Invite not found',
                message: 'The invitation link you followed is invalid or has already been used.',
            })
        }
        if (searchParams.get('error') === 'session') {
            setClerkError({
                title: 'Session Error',
                message: 'There was a problem with your session. Please sign in again.',
            })
        }
    }, [searchParams])

    const form = useForm<SignInFormData>({
        initialValues: {
            email: '',
            password: '',
        },
        validate: zodResolver(signInSchema),
    })

    useEffect(() => {
        if (isSignedIn && !signedInRecently) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsSigningOut(true)
            signOut().finally(() => setIsSigningOut(false))
        }
    }, [isSignedIn, signOut, signedInRecently])

    if (isSignedIn || isSigningOut || !signIn || mfa) return null

    const rawRedirect = searchParams.get('redirect_url')
    const validatedRedirect = safeRedirectUrl(rawRedirect, Routes.home)
    const forgotPasswordHref = (
        rawRedirect && validatedRedirect !== Routes.home
            ? `${Routes.accountResetPassword}?redirect_url=${encodeURIComponent(validatedRedirect)}`
            : Routes.accountResetPassword
    ) as Route

    const onSubmit = form.onSubmit(async (values) => {
        setSignedInRecently(true)
        try {
            const attempt = await signIn.create({
                identifier: values.email,
                password: values.password,
            })
            if (attempt.status === 'complete') {
                await setActive({ session: attempt.createdSessionId })
                await onComplete(false)
                const result = actionResult(await onUserSignInAction())
                await getToken({ skipCache: true })
                if (result?.redirectToKeyGeneration) {
                    router.push(Routes.accountKeys as Route)
                } else {
                    router.push(validatedRedirect)
                }
            }
            if (attempt.status === 'needs_second_factor') {
                // Auth method not yet determined, set to false for now
                await onComplete({ signIn: attempt, usingSMS: false })
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')

            const errorMessage = errorToString(err, clerkErrorOverrides)

            //incorrect email or password
            if (
                errorMessage === clerkErrorOverrides.form_password_incorrect ||
                errorMessage === clerkErrorOverrides.form_identifier_not_found ||
                errorMessage === "You're already signed in."
            ) {
                form.setFieldError('email', ' ')
                form.setFieldError('password', errorMessage)
                return
            }

            // any other clerk error
            let title = 'Sign-in Error'
            if (err && typeof err === 'object' && 'errors' in err && Array.isArray(err.errors)) {
                const lockedError = err.errors.find((e: { code?: string }) => e.code === 'user_locked')
                if (lockedError) {
                    title = 'Account Locked'
                }
            }

            setClerkError({
                title,
                message: errorMessage || 'An error occurred during sign-in. Please try again.',
            })
        }
    })

    return (
        <SignInFormView
            form={form}
            onSubmit={onSubmit}
            forgotPasswordHref={forgotPasswordHref}
            clerkError={clerkError}
            setClerkError={setClerkError}
        />
    )
}
