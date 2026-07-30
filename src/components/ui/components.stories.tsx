import type { Story } from '@ladle/react'
import { Alert, Button, Group, Stack } from '@mantine/core'
import { Heading, Text } from '@/components/ui'

// Variant matrices mirroring the Figma component pages so they can be compared side by side.
//   Button 4216:2 · Alert 61:5826
// Geometry is transcribed from Figma; colors are mapped by role through the semantic tokens,
// because the Figma component pages are still drawn on a stale palette.

const meta = { title: 'AA Design system / Components' }
export default meta

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const

// Figma's variant axis -> the Mantine equivalent. `error` is a color, not a variant, in Mantine.
const BUTTON_VARIANTS = [
    { label: 'filled', props: { variant: 'filled' } },
    { label: 'error (Figma) → color="red"', props: { variant: 'filled', color: 'red' } },
    { label: 'outline', props: { variant: 'outline' } },
    { label: 'subtle', props: { variant: 'subtle' } },
    { label: 'Disable (Figma) → disabled', props: { disabled: true } },
] as const

const ALERT_COLORS = [
    { label: 'Red', color: 'red' },
    { label: 'Green', color: 'green' },
    { label: 'Purple', color: 'purple' },
    { label: 'Blue', color: 'blue' },
    { label: 'Yellow', color: 'yellow' },
] as const

// Figma spells this axis "Varient" (sic).
const ALERT_VARIANTS = ['light', 'filled', 'outline'] as const

export const Buttons: Story = () => (
    <Stack p="xl" gap="xl">
        <Stack gap="xs">
            <Heading size="page-sm">Button — sizes</Heading>
            <Text size="body-sm" c="dimmed">
                Figma 4216:2. xs h30/pad14/font12 → xl h60/pad32/font20, radius 2 throughout.
            </Text>
            <Group align="center">
                {SIZES.map((size) => (
                    <Button key={size} size={size}>
                        Button {size}
                    </Button>
                ))}
            </Group>
        </Stack>

        <Stack gap="xs">
            <Heading size="page-sm">Button — variants</Heading>
            {BUTTON_VARIANTS.map(({ label, props }) => (
                <Group key={label} align="center">
                    <Text size="description" c="dimmed" w={220}>
                        {label}
                    </Text>
                    <Button {...props}>Button</Button>
                </Group>
            ))}
        </Stack>
    </Stack>
)

export const Alerts: Story = () => (
    <Stack p="xl" gap="xl">
        <Stack gap="xs">
            <Heading size="page-sm">Alert</Heading>
            <Text size="body-sm" c="dimmed">
                Figma 61:5826. Pad 12/16, gap 8. Light = shade 0, filled = shade 5, outline = white + shade-5 border.
            </Text>
        </Stack>
        {ALERT_VARIANTS.map((variant) => (
            <Stack key={variant} gap="xs">
                <Text size="body-md" fw={700}>
                    {variant}
                </Text>
                {ALERT_COLORS.map(({ label, color }) => (
                    <Alert key={label} variant={variant} color={color} title={label}>
                        Alert with paragraph text — the authoritative row in the Figma variant matrix.
                    </Alert>
                ))}
            </Stack>
        ))}
    </Stack>
)
