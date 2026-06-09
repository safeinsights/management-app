import type { Story } from '@ladle/react'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from './resubmit-cancel-button'

// Like CancelButton but navigates to a caller-supplied href instead of home.
// The confirmation modal appears only when isDirty is true.
const meta = { title: 'Buttons / ResubmitCancelButton' }
export default meta

export const Clean: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <ResubmitCancelButton isDirty={false} disabled={false} href={Routes.dashboard} />
    </div>
)

export const Dirty: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <ResubmitCancelButton isDirty={true} disabled={false} href={Routes.dashboard} />
    </div>
)

export const Disabled: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <ResubmitCancelButton isDirty={true} disabled={true} href={Routes.dashboard} />
    </div>
)
