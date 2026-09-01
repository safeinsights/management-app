import type { Story } from '@ladle/react'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Container } from '@mantine/core'
import { useForm } from '@/common'
import { Routes } from '@/lib/routes'
import { focusedBackgroundArgTypes } from '~ladle/backgrounds'
import { SignInFormView, type SignInFormValues } from './sign-in-form-view'

const meta = { title: 'Pages / Sign in', argTypes: focusedBackgroundArgTypes }
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
