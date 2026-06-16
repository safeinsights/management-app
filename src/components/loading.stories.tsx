import type { Story } from '@ladle/react'
import { Stack } from '@mantine/core'
import { LoadingMessage } from './loading'

const meta = { title: 'Feedback / Loading' }
export default meta

export const Default: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <LoadingMessage message="Loading studies..." />
    </div>
)

export const LongMessage: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <LoadingMessage message="Preparing your results, this may take a few moments while we decrypt the files from the enclave..." />
    </div>
)

// isVisible={false} returns null, so nothing should render between the surrounding messages.
export const Hidden: Story = () => (
    <div style={{ padding: 24, maxWidth: 760 }}>
        <Stack gap="md">
            <LoadingMessage message="Visible loader (isVisible defaults to shown)" />
            <LoadingMessage message="Hidden loader (should not render)" isVisible={false} />
        </Stack>
    </div>
)
