import type { Story } from '@ladle/react'
import { Stack } from '@mantine/core'
import { ErrorAlert, AccessDeniedAlert, AlertNotFound, InputError } from './errors'

const meta = { title: 'Feedback / Errors' }
export default meta

// ErrorAlert renders its error through errorToString, which accepts plain strings,
// Error instances, and the app's action-error shapes.
export const ErrorAlertString: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorAlert error="The study could not be loaded." />
    </div>
)

export const ErrorAlertException: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorAlert error={new Error('Connection to the enclave timed out')} />
    </div>
)

export const ErrorAlertCustomTitle: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorAlert title="Upload failed" error="The file exceeds the maximum allowed size of 50 MB." />
    </div>
)

export const ErrorAlertLongMessage: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <ErrorAlert error="An unexpected error occurred while processing your request. Please try again in a few minutes. If the problem persists, contact support and include the reference identifier shown in your notifications." />
    </div>
)

export const AccessDeniedDefault: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <AccessDeniedAlert />
    </div>
)

export const AccessDeniedCustomMessage: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <AccessDeniedAlert message="You must be a reviewer for this organization to view study results." />
    </div>
)

export const NotFound: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <AlertNotFound title="Study not found" message="We could not find a study with the requested identifier." />
    </div>
)

export const NotFoundLongMessage: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <AlertNotFound
            title="Organization not found"
            message="The organization you are trying to reach does not exist or you no longer have access to it. Double-check the link or return to your dashboard."
        />
    </div>
)

// hideIf=true returns null; the alert below it should be the only thing visible.
export const NotFoundHidden: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <AlertNotFound hideIf title="Hidden (should not render)" message="This message is suppressed by hideIf." />
        <AlertNotFound title="Visible alert" message="hideIf is false here, so this one renders." />
    </div>
)

// InputError returns null for empty/falsy errors; the field-level error sits inline.
export const Input: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <Stack gap="md">
            <InputError error="This field is required" />
            <InputError error="Email address is not valid" />
            <InputError error={null} />
        </Stack>
    </div>
)
