import type { Story } from '@ladle/react'
import { CancelButton } from './cancel-button'

// The Cancel button opens a confirmation modal only when the form is dirty;
// when clean it would navigate home (router is inert in Ladle). Click the
// dirty story's button to see the AppModal confirmation flow.
const meta = { title: 'Buttons / Cancel button' }
export default meta

export const Clean: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CancelButton isDirty={false} disabled={false} />
    </div>
)

export const Dirty: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CancelButton isDirty={true} disabled={false} />
    </div>
)

export const Disabled: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CancelButton isDirty={true} disabled={true} />
    </div>
)
