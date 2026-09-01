import type { Story } from '@ladle/react'
import { Text, Title } from '@mantine/core'
import { RequiredIndicator } from './required-indicator'

const meta = { title: 'Forms / Required indicator' }
export default meta

export const Visible: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <Text span>
            Email address
            <RequiredIndicator isVisible={true} />
        </Text>
    </div>
)

export const Hidden: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <Text span>
            Email address (no asterisk renders)
            <RequiredIndicator isVisible={false} />
        </Text>
    </div>
)

export const DefaultIsVisible: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <Text span>
            Default (no isVisible prop)
            <RequiredIndicator />
        </Text>
    </div>
)

export const NextToHeading: Story = () => (
    <div style={{ padding: 24, maxWidth: 640 }}>
        <Title order={3}>
            Section title
            <RequiredIndicator fz="h3" fw={700} />
        </Title>
    </div>
)
