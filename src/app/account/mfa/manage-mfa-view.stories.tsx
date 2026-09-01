import type { Story } from '@ladle/react'
import { focusedBackgroundArgTypes } from '~ladle/backgrounds'
import { ManageMFAView } from './manage-mfa-view'

const meta = { title: 'Pages / MFA status', argTypes: focusedBackgroundArgTypes }
export default meta

export const Enabled: Story = () => (
    <div style={{ padding: 24 }}>
        <ManageMFAView hasMFA />
    </div>
)

export const EnrollmentOptions: Story = () => (
    <div style={{ padding: 24 }}>
        <ManageMFAView hasMFA={false} />
    </div>
)
