import type { Story } from '@ladle/react'
import { Stack, TextInput } from '@mantine/core'
import { FormFieldLabel } from './form-field-label'

// Accessible Mantine Input.Label with three variants. Note: in the component,
// only the 'orgset' variant is special-cased; the 'optional' and default
// variants both render a Title (order 5) with slightly different font weights.
const meta = { title: 'Forms / FormFieldLabel' }
export default meta

export const Default: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Study title" inputId="study-title" />
    </div>
)

export const Required: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Study title" required inputId="study-title-req" />
    </div>
)

export const OrgsetVariant: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Organization name" variant="orgset" inputId="org-name" />
    </div>
)

export const OrgsetVariantRequired: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Organization name" variant="orgset" required inputId="org-name-req" />
    </div>
)

export const OptionalVariant: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Additional notes" variant="optional" inputId="notes" />
    </div>
)

export const OptionalVariantRequired: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel label="Additional notes" variant="optional" required inputId="notes-req" />
    </div>
)

export const LongLabel: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <FormFieldLabel
            label="A particularly long form field label that should wrap onto multiple lines without breaking the layout"
            required
            inputId="long-label"
        />
    </div>
)

export const WiredToAnInput: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <Stack gap={4}>
            <FormFieldLabel label="Email address" required inputId="email-wired" />
            <TextInput id="email-wired" placeholder="you@example.com" />
        </Stack>
    </div>
)
