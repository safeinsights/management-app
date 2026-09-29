import type { Story } from '@ladle/react'
import { Box, Group, Paper, SimpleGrid, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { semanticShades, semanticColor, type SemanticToken } from '@/theme/tokens'

// The design-system catalog, transcribed from the SI UI Component Library Figma file.
// Every value is read back out of the live theme, so this page IS the verification surface:
// if a token is wrong here, it is wrong in the app.

const meta = { title: 'AA Design system / Foundations' }
export default meta

const RAMPS = ['navy', 'turquoise', 'blue', 'green', 'yellow', 'red', 'purple', 'charcoal', 'grey'] as const
const SHADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

// Figma collection `font-size`, in full. Mantine keys only exist for the middle five.
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 22, 26, 34, 40] as const
const LINE_HEIGHTS = [
    { name: 'tight', value: '1.2' },
    { name: 'heading', value: '1.35' },
    { name: 'normal', value: '1.5' },
] as const
const FONT_WEIGHTS = [
    { name: 'regular', value: 400 },
    { name: 'semibold', value: 600 },
    { name: 'bold', value: 700 },
] as const

const SCALE_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const SPACING_KEYS = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const

const Swatch = ({ color, label, sub }: { color: string; label: string; sub?: string }) => (
    <Stack gap={4}>
        <Box style={{ background: color, height: 56, borderRadius: 2, border: '1px solid #0001' }} />
        <Text size="xs" c="dimmed">
            {label}
        </Text>
        {sub ? (
            <Text size="xs" c="dimmed">
                {sub}
            </Text>
        ) : null}
    </Stack>
)

export const ColorRamps: Story = () => {
    const theme = useMantineTheme()

    return (
        <Stack p="xl" gap="xl">
            <Title order={2}>Color primitives</Title>
            <Text size="sm" c="dimmed">
                Figma collection `color primitive`. Every ramp is exactly ten shades indexed 0-9.
            </Text>
            {RAMPS.map((ramp) => (
                <Stack key={ramp} gap="xs">
                    <Text size="md" fw={700}>
                        {ramp}
                    </Text>
                    <SimpleGrid cols={10} spacing="xs">
                        {SHADES.map((shade) => (
                            <Swatch
                                key={shade}
                                color={theme.colors[ramp][shade]}
                                label={`${shade}`}
                                sub={theme.colors[ramp][shade]}
                            />
                        ))}
                    </SimpleGrid>
                </Stack>
            ))}
        </Stack>
    )
}

const semanticEntries = Object.entries(semanticShades) as [SemanticToken, string][]

export const SemanticTokens: Story = () => (
    <Stack p="xl" gap="md">
        <Title order={2}>Semantic tokens</Title>
        <Text size="sm" c="dimmed">
            Each token is bound to a primitive exactly as Figma’s `semantic tokens` collection states it. Labels show
            the binding so a mismatch is visible here rather than in the app.
        </Text>
        <SimpleGrid cols={4} spacing="lg">
            {semanticEntries.map(([token, ref]) => (
                <Swatch key={token} color={semanticColor(token)} label={token} sub={`→ ${ref}`} />
            ))}
        </SimpleGrid>
    </Stack>
)

export const Typography: Story = () => (
    <Stack p="xl" gap="lg">
        <Title order={2}>Type scale</Title>
        <Text size="sm" c="dimmed">
            Open Sans. Figma defines size, weight and line-height as separate primitives — the composed heading styles
            in its “Text styles” frame still contradict them, so they are not modelled here (OTTER-661).
        </Text>
        {FONT_SIZES.map((size) => (
            <Text key={size} style={{ fontSize: `var(--si-font-size-${size})` }}>
                The quick brown fox jumps over the lazy dog — {size}px
            </Text>
        ))}
        <Stack gap={2}>
            {FONT_WEIGHTS.map(({ name, value }) => (
                <Text key={name} fw={value}>
                    Body 16 {name} ({value})
                </Text>
            ))}
        </Stack>
        <Stack gap="xs">
            {LINE_HEIGHTS.map(({ name, value }) => (
                <Text key={name} lh={value} w={360}>
                    {name} · {value} — the quick brown fox jumps over the lazy dog and keeps on running
                </Text>
            ))}
        </Stack>
    </Stack>
)

export const RadiusAndShadow: Story = () => {
    const theme = useMantineTheme()

    return (
        <Stack p="xl" gap="xl">
            <Stack gap="xs">
                <Title order={2}>Corner radius</Title>
                <Group gap="lg">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Box
                                w={80}
                                h={80}
                                style={{ background: theme.colors.navy[5], borderRadius: theme.radius[key] }}
                            />
                            <Text size="xs" c="dimmed">
                                {key} · {theme.radius[key]}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Title order={2}>Shadows</Title>
                <Text size="sm" c="dimmed">
                    Figma defines shadows as separate blur/spread/offset/opacity parts with no color; these compose them
                    over black.
                </Text>
                <Group gap="xl">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Paper w={100} h={80} shadow={key} radius="xs" />
                            <Text size="xs" c="dimmed">
                                {key}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Title order={2}>Spacing</Title>
                {SPACING_KEYS.map((key) => (
                    <Group key={key} gap="sm" align="center">
                        <Text size="xs" c="dimmed" w={80}>
                            {key} · {theme.spacing[key]}
                        </Text>
                        <Box h={16} w={theme.spacing[key]} style={{ background: theme.colors.turquoise[5] }} />
                    </Group>
                ))}
            </Stack>
        </Stack>
    )
}
