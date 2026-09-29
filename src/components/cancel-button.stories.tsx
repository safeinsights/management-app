import type { Story } from '@ladle/react'
import { CancelButton } from './cancel-button'

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
