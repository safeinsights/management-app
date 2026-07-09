import type { Story } from '@ladle/react'
import { Group, Paper, Stack, Text } from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import { SiBulbLogo } from './si-bulb-logo'
import { SmallMonoColorLogo } from './small-mono-color-logo'

// The app's logo SVGs (pure presentational), shown at a few sizes. SmallMonoColorLogo renders
// in white, so it's placed on a dark purple backdrop matching the app header/sidebar.
const meta = { title: 'Layout / Logos' }
export default meta

export const SafeInsightsWordmark: Story = () => (
    <Stack p="xl" gap="lg" align="flex-start">
        <SafeInsightsLogo width={140} />
        <SafeInsightsLogo />
        <SafeInsightsLogo width={250} height={54} />
    </Stack>
)

export const BulbLogo: Story = () => (
    <Group p="xl" align="center" gap="xl">
        <SiBulbLogo width={24} />
        <SiBulbLogo width={48} />
        <SiBulbLogo width={96} />
    </Group>
)

export const MonoColorLogo: Story = () => (
    <Paper p="xl" bg="purple.8">
        <Group align="center" gap="xl">
            <SmallMonoColorLogo width={32} />
            <SmallMonoColorLogo width={64} />
            <SmallMonoColorLogo width={120} />
        </Group>
        <Text c="white" mt="md" fz="sm">
            Mono logo on the app header/sidebar purple.
        </Text>
    </Paper>
)
