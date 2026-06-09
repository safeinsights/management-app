import type { Story } from '@ladle/react'
import { ManageMFAView } from './manage-mfa-view'

// MFA status page-view. ManageMFAView is presentational; the `hasMFA` flag (read from
// Clerk's twoFactorEnabled in the real container) selects between the success
// confirmation card and the enrollment-options card.
const meta = { title: 'Pages / MFA status' }
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
