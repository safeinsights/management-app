import type { Story } from '@ladle/react'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Container } from '@mantine/core'
import { useForm } from '@/common'
import { Routes } from '@/lib/routes'
import { SignInFormView, type SignInFormValues } from './sign-in-form-view'

// The sign-in page-view. SignInFormView is presentational: the real container owns Clerk's
// useSignIn + MFA + redirect logic. Here a story creates a plain Mantine form (no Clerk/server
// submit), passes a no-op onSubmit, and varies the injected state (empty/invalid vs. valid vs.
// Clerk error banner). The navy focused shell is approximated with a backdrop so the card reads
// in context without importing the Clerk-coupled FocusedLayoutShell.
const meta = { title: 'Pages / Sign in' }
export default meta

const noop = () => {}

function FocusedBackdrop({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <Container w={500}>{children}</Container>
        </div>
    )
}

function useStoryForm(initialValues: SignInFormValues) {
    return useForm<SignInFormValues>({
        mode: 'controlled',
        initialValues,
        validate: {
            email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
            password: (value) => (value.length > 0 ? null : 'Required'),
        },
        validateInputOnChange: true,
    })
}

export const Default: Story = () => {
    const form = useStoryForm({ email: '', password: '' })
    return (
        <FocusedBackdrop>
            <SignInFormView
                form={form}
                onSubmit={noop}
                forgotPasswordHref={Routes.accountResetPassword as Route}
                clerkError={null}
                setClerkError={noop}
            />
        </FocusedBackdrop>
    )
}

export const FilledAndValid: Story = () => {
    const form = useStoryForm({ email: 'ada@example.com', password: 'super-secret' })
    return (
        <FocusedBackdrop>
            <SignInFormView
                form={form}
                onSubmit={noop}
                forgotPasswordHref={Routes.accountResetPassword as Route}
                clerkError={null}
                setClerkError={noop}
            />
        </FocusedBackdrop>
    )
}

export const WithError: Story = () => {
    const form = useStoryForm({ email: 'ada@example.com', password: 'wrong-password' })
    return (
        <FocusedBackdrop>
            <SignInFormView
                form={form}
                onSubmit={noop}
                forgotPasswordHref={Routes.accountResetPassword as Route}
                clerkError={{
                    title: 'Account Locked',
                    message: 'Your account is locked due to too many failed attempts. Try again later.',
                }}
                setClerkError={noop}
            />
        </FocusedBackdrop>
    )
}
