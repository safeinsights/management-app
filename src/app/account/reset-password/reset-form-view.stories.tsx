import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Container } from '@mantine/core'
import { useForm } from '@/common'
import { ResetFormView, type ResetFormValues } from './reset-form-view'

// The reset-password page-view. ResetFormView is presentational: the real container owns Clerk's
// useSignIn + the reset-email mutation. Here a story creates a plain Mantine form (no Clerk/server
// submit), passes a no-op onSubmit, and varies the injected state (empty/invalid vs. valid vs.
// pending). The navy focused shell is approximated with a backdrop so the card reads in context
// without importing the Clerk-coupled FocusedLayoutShell.
const meta = { title: 'Pages / Reset password' }
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

function useStoryForm(initialValues: ResetFormValues) {
    return useForm<ResetFormValues>({
        mode: 'controlled',
        initialValues,
        validate: {
            email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
        },
        validateInputOnChange: true,
    })
}

export const Default: Story = () => {
    const form = useStoryForm({ email: '' })
    return (
        <FocusedBackdrop>
            <ResetFormView form={form} onSubmit={noop} isPending={false} />
        </FocusedBackdrop>
    )
}

export const FilledAndValid: Story = () => {
    const form = useStoryForm({ email: 'ada@example.com' })
    return (
        <FocusedBackdrop>
            <ResetFormView form={form} onSubmit={noop} isPending={false} />
        </FocusedBackdrop>
    )
}

export const Sending: Story = () => {
    const form = useStoryForm({ email: 'ada@example.com' })
    return (
        <FocusedBackdrop>
            <ResetFormView form={form} onSubmit={noop} isPending={true} />
        </FocusedBackdrop>
    )
}
