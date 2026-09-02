import type { Story } from '@ladle/react'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from './resubmit-cancel-button'

const meta = { title: 'Buttons / Resubmit cancel button' }
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
