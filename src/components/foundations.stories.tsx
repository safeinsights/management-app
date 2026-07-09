import type { Story } from '@ladle/react'
import { Badge, Button, Group, Stack, Text, Title } from '@mantine/core'

// Sanity story rendering Mantine primitives through the app's real theme — confirms
// theme tokens (color, type scale, radius) and the font load apply in Ladle.
const meta = { title: 'Foundations / Sanity check' }
export default meta

export const Typography: Story = () => (
    <Stack p="xl" gap="sm">
        <Title order={1}>Heading 1</Title>
        <Title order={2}>Heading 2</Title>
        <Title order={3}>Heading 3</Title>
        <Text>Body text rendered in the app’s real theme font and color.</Text>
        <Text c="dimmed">Dimmed secondary text.</Text>
    </Stack>
)

export const Buttons: Story = () => (
    <Group p="xl">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="light">Light</Button>
        <Button disabled>Disabled</Button>
    </Group>
)

export const Badges: Story = () => (
    <Group p="xl">
        <Badge color="green">Approved</Badge>
        <Badge color="yellow">Under review</Badge>
        <Badge color="red">Errored</Badge>
        <Badge color="blue">Info</Badge>
    </Group>
)
