import type { Story } from '@ladle/react'
import { Box, Group, Paper, SimpleGrid, Stack, useMantineTheme } from '@mantine/core'
import { Heading, Text } from '@/components/ui'
import { semanticShades, semanticColor, type SemanticToken } from '@/theme/tokens'

// The design-system catalog — Figma: IqiKTkT92Dq9YHn5FjlAKr
//   Color Primitives 7593:20494 · Color tokens 4962:1085 · Text styles 3223:2493
// Every value is read back out of the live theme, so this page IS the verification surface:
// if a token is wrong here, it is wrong in the app.

const meta = { title: 'Foundations / Design system' }
export default meta

const RAMPS = ['navy', 'violet', 'blue', 'turquoise', 'green', 'gold', 'red', 'gray'] as const
const SHADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

const HEADING_SPECS = [
    { size: 'h0', note: 'Page title — 40 / 700 / 150%' },
    { size: 'h3', note: 'Section heading — 22 / 700 / 140%' },
    { size: 'h5', note: 'Body title — 20 / 700 / 165%' },
] as const

const TEXT_SPECS = [
    { size: 'b1', note: 'Large body — 18 / 400 / 160%' },
    { size: 'b2', note: 'Body — 16 / 155%' },
    { size: 'b3', note: 'Small body — 14 / 155%' },
    { size: 'b4', note: 'Description — 12 / 400 / 140%' },
    { size: 'b5', note: 'Sub-text — 10 / 155%' },
] as const

const SCALE_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const SPACING_KEYS = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const

const Swatch = ({ color, label, sub }: { color: string; label: string; sub?: string }) => (
    <Stack gap={4}>
        <Box style={{ background: color, height: 56, borderRadius: 2, border: '1px solid #0001' }} />
        <Text size="b4" c="dimmed">
            {label}
        </Text>
        {sub ? (
            <Text size="b5" c="dimmed">
                {sub}
            </Text>
        ) : null}
    </Stack>
)

export const ColorRamps: Story = () => {
    const theme = useMantineTheme()

    return (
        <Stack p="xl" gap="xl">
            <Heading size="h3">Color primitives</Heading>
            <Text size="b3" c="dimmed">
                8 families × 10 shades. Shade 5 is the brand color in every ramp. Figma 7593:20494.
            </Text>
            {RAMPS.map((ramp) => (
                <Stack key={ramp} gap="xs">
                    <Text size="b2" fw={700}>
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
        <Heading size="h3">Semantic tokens</Heading>
        <Text size="b3" c="dimmed">
            Figma 4962:1085 names, bound by role to the ramps above. These bindings are inferred — the Figma semantic
            layer still points at the pre-Navy palette — so this table is what needs UX sign-off.
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
        <Heading size="h3">Type scale</Heading>
        <Text size="b3" c="dimmed">
            Open Sans. Names mirror the Figma primitives exactly — Figma defines h0, h3 and h5 only. Figma 3223:2493.
        </Text>
        {HEADING_SPECS.map(({ size, note }) => (
            <Stack key={size} gap={2}>
                <Heading size={size}>The quick brown fox ({size})</Heading>
                <Text size="b4" c="dimmed">
                    {note}
                </Text>
            </Stack>
        ))}
        {TEXT_SPECS.map(({ size, note }) => (
            <Stack key={size} gap={2}>
                <Text size={size}>The quick brown fox jumps over the lazy dog ({size})</Text>
                <Text size="b4" c="dimmed">
                    {note}
                </Text>
            </Stack>
        ))}
        <Stack gap={2}>
            <Text size="b2" fw={400}>
                Body 16 Regular (400)
            </Text>
            <Text size="b2" fw={600}>
                Body 16 Semi-bold (600)
            </Text>
            <Text size="b2" fw={700}>
                Body 16 Bold (700)
            </Text>
        </Stack>
    </Stack>
)

export const RadiusAndShadow: Story = () => {
    const theme = useMantineTheme()

    return (
        <Stack p="xl" gap="xl">
            <Stack gap="xs">
                <Heading size="h3">Corner radius</Heading>
                <Text size="b3" c="dimmed">
                    Figma 5042:214107. Default radius is xs (2px) — the radius on every Figma button.
                </Text>
                <Group gap="lg">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Box
                                w={80}
                                h={80}
                                style={{ background: theme.colors.navy[5], borderRadius: theme.radius[key] }}
                            />
                            <Text size="b4" c="dimmed">
                                {key} · {theme.radius[key]}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Heading size="h3">Shadows</Heading>
                <Text size="b3" c="dimmed">
                    Figma 4910:360.
                </Text>
                <Group gap="xl">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Paper w={100} h={80} shadow={key} radius="xs" />
                            <Text size="b4" c="dimmed">
                                {key}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Heading size="h3">Spacing</Heading>
                <Text size="b3" c="dimmed">
                    Figma 3185:595. Base 16px = 1rem.
                </Text>
                {SPACING_KEYS.map((key) => (
                    <Group key={key} gap="sm" align="center">
                        <Text size="b4" c="dimmed" w={80}>
                            {key} · {theme.spacing[key]}
                        </Text>
                        <Box h={16} w={theme.spacing[key]} style={{ background: theme.colors.turquoise[5] }} />
                    </Group>
                ))}
            </Stack>
        </Stack>
    )
}
