import { Flex, Button, TextInput, PasswordInput, Paper, Title } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { clerkErrorOverrides, reportError } from '@/components/errors'
import { useAuth, useSignIn, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { type MFAState, signInToMFAState } from './logic'
import { FC, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { errorToString } from '@/components/errors'
import { SignInError } from './sign-in-error'

const signInSchema = z.object({
    email: z.string().min(1, 'Email is required').max(250, 'Email too long').email('Invalid email'),
    password: z.string().min(1, 'Required'),
})

type SignInFormData = z.infer<typeof signInSchema>

export const SignInForm: FC<{
    mfa: MFAState
    onComplete: (state: MFAState) => Promise<void>
}> = ({ mfa, onComplete }) => {
    const { signOut } = useAuth()
    const [signedInRecently, setSignedInRecently] = useState(false)
    const { setActive, signIn } = useSignIn()
    const { isSignedIn } = useUser()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [clerkError, setClerkError] = useState<{ title: string; message: string } | null>(null)

    const form = useForm<SignInFormData>({
        initialValues: {
            email: '',
            password: '',
        },
        validate: zodResolver(signInSchema),
    })

    useEffect(() => {
        if (isSignedIn && !signedInRecently) signOut()
    }, [isSignedIn, signOut, signedInRecently])

    if (isSignedIn || !signIn || mfa) return null

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
                const redirectUrl = searchParams.get('redirect_url')
                router.push(redirectUrl || '/')
            }
            if (attempt.status === 'needs_second_factor') {
                const state = await signInToMFAState(attempt)
                await onComplete(state)
            }
        } catch (err: unknown) {
            reportError(err, 'Failed Signin Attempt')

            const errorMessage = errorToString(err, clerkErrorOverrides)

            //incorrect email or password
            if (
                errorMessage === clerkErrorOverrides.form_password_incorrect ||
                errorMessage === clerkErrorOverrides.form_identifier_not_found
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
        <form onSubmit={onSubmit}>
            <Paper bg="white" radius="sm" p="xxl">
                <Title mb="lg" order={3} ta="center">
                    Welcome To SafeInsights!
                </Title>
                <Flex direction="column" gap="xs">
                    <TextInput
                        key={form.key('email')}
                        {...form.getInputProps('email')}
                        label="Email"
                        placeholder="Enter your registered email address"
                        aria-label="Email"
                    />
                    <PasswordInput
                        label="Password"
                        key={form.key('password')}
                        {...form.getInputProps('password')}
                        mt={10}
                        placeholder="*********"
                        aria-label="Password"
                    />
                    <Link
                        c="blue.7"
                        fw={600}
                        w="fit-content"
                        size="xs"
                        href={`/account/reset-password${searchParams.get('redirect_url') ? `?redirect_url=${searchParams.get('redirect_url')}` : ''}`}
                    >
                        Forgot password?
                    </Link>
                    <SignInError clerkError={clerkError} setClerkError={setClerkError} />
                    {/*<Link href="/account/signup">Don&#39;t have an account? Sign Up Now</Link>*/}
                    <Button
                        mt="md"
                        mb="xxl"
                        size="lg"
                        disabled={!form.isValid()}
                        type="submit"
                        bg={!form.isValid() ? 'grey.1' : ''}
                    >
                        Login
                    </Button>
                </Flex>
            </Paper>
        </form>
    )
}
