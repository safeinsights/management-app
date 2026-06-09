import type { Story } from '@ladle/react'
import { CopyingInput } from './copying-input'

// A read-only input with a copy-to-clipboard button in the right section.
// Clicking the icon copies the value and briefly swaps to a green check plus a
// "Copied" tooltip.
const meta = { title: 'Forms / CopyingInput' }
export default meta

export const Default: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CopyingInput value="ABC-123-XYZ" />
    </div>
)

export const CustomTooltipLabel: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CopyingInput value="https://safeinsights.org/invite/9f8c2a" tooltipLabel="Copy invite link" />
    </div>
)

export const LongValue: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <CopyingInput value="0123456789-abcdefghijklmnopqrstuvwxyz-0123456789-abcdefghijklmnopqrstuvwxyz" />
    </div>
)
