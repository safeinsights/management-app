import type { Story } from '@ladle/react'
import { Alert, Button, Group, Stack } from '@mantine/core'
import { Heading, Text } from '@/components/ui'

// Variant matrices mirroring the Figma pages so they can be compared side by side.
//   Button 4216:2 (ready) · Alert 61:5826 (ready)
// Geometry is transcribed from Figma; colors are mapped by role onto the Navy ramps, because the
// Figma component pages are still drawn on the pre-Navy palette.

const meta = { title: 'Foundations / Components' }
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

// Figma's Color axis. Purple/Yellow are pre-Navy names — they map to violet/gold.
const ALERT_COLORS = [
    { figma: 'Red', color: 'red' },
    { figma: 'Green', color: 'green' },
    { figma: 'Purple → violet', color: 'violet' },
    { figma: 'Blue', color: 'blue' },
    { figma: 'Yellow → gold', color: 'gold' },
] as const

// Figma spells this axis "Varient" (sic).
const ALERT_VARIANTS = ['light', 'filled', 'outline'] as const

export const Buttons: Story = () => (
    <Stack p="xl" gap="xl">
        <Stack gap="xs">
            <Heading size="h3">Button — sizes</Heading>
            <Text size="b3" c="dimmed">
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
            <Heading size="h3">Button — variants</Heading>
            {BUTTON_VARIANTS.map(({ label, props }) => (
                <Group key={label} align="center">
                    <Text size="b4" c="dimmed" w={220}>
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
            <Heading size="h3">Alert</Heading>
            <Text size="b3" c="dimmed">
                Figma 61:5826. Pad 12/16, gap 8. Light = shade 0, filled = shade 5, outline = white + shade-5 border.
            </Text>
        </Stack>
        {ALERT_VARIANTS.map((variant) => (
            <Stack key={variant} gap="xs">
                <Text size="b2" fw={700}>
                    {variant}
                </Text>
                {ALERT_COLORS.map(({ figma, color }) => (
                    <Alert key={figma} variant={variant} color={color} title={figma}>
                        Alert with paragraph text — the authoritative row in the Figma variant matrix.
                    </Alert>
                ))}
            </Stack>
        ))}
    </Stack>
)
