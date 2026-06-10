import type { Story } from '@ladle/react'
import { Container, Paper, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { focusedBackgroundArgTypes } from '../../../../../.ladle/backgrounds'
import { AddSmsMfaView, type PhoneFormValues } from './add-sms-mfa-view'

// SMS MFA enrollment step-1 page-view. AddSmsMfaView is presentational; the container
// owns the Clerk enroll flow. @mantine/form's useForm works under Ladle, so each story
// builds a real form and passes it down with a no-op submit handler.
const meta = { title: 'Pages / MFA SMS', argTypes: focusedBackgroundArgTypes }
export default meta

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <Container style={{ padding: 24 }}>
            <Paper bg="white" p="xxl" radius="sm" maw={500}>
                <Stack gap="lg">{children}</Stack>
            </Paper>
        </Container>
    )
}

function StoryForm({
    initialValues,
    errors,
    isSendingSms = false,
}: {
    initialValues?: Partial<PhoneFormValues>
    errors?: Partial<Record<keyof PhoneFormValues, string>>
    isSendingSms?: boolean
}) {
    const form = useForm<PhoneFormValues>({
        initialValues: { phoneNumber: initialValues?.phoneNumber ?? '' },
        initialErrors: errors,
    })
    return (
        <Frame>
            <AddSmsMfaView form={form} onSubmit={() => {}} isSendingSms={isSendingSms} />
        </Frame>
    )
}

export const Empty: Story = () => <StoryForm />

export const PrefilledValidNumber: Story = () => <StoryForm initialValues={{ phoneNumber: '+12015550123' }} />

export const InvalidNumberError: Story = () => (
    <StoryForm
        initialValues={{ phoneNumber: '+1201555' }}
        errors={{ phoneNumber: 'Please enter a valid US phone number.' }}
    />
)

export const Sending: Story = () => <StoryForm initialValues={{ phoneNumber: '+12015550123' }} isSendingSms />
