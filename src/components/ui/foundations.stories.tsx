import type { Story } from '@ladle/react'
import { Box, Group, Paper, SimpleGrid, Stack, useMantineTheme } from '@mantine/core'
import { Heading, Text } from '@/components/ui'
import { semanticShades, semanticColor, type SemanticToken } from '@/theme/tokens'

// The design-system catalog, from "Interim design tokens - handoff - Jul 2026".
// Every value is read back out of the live theme, so this page IS the verification surface:
// if a token is wrong here, it is wrong in the app.

const meta = { title: 'AA Design system / Foundations' }
export default meta

const RAMPS = ['purple', 'navy', 'turquoise', 'blue', 'green', 'yellow', 'red', 'charcoal', 'grey'] as const
const SHADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

const HEADING_SPECS = [
    { size: 'display', note: 'Display — 40 / 700 / 120%' },
    { size: 'page', note: 'Page title — 34 / 700 / 135%' },
    { size: 'page-sm', note: 'Page title small — 22 / 700 / 135%' },
    { size: 'card', note: 'Card heading — 20 / 700 / 135%' },
    { size: 'minor', note: 'Minor heading — 16 / 700 / 135%' },
] as const

const TEXT_SPECS = [
    { size: 'body-lg', note: 'Large body — 18 / 400 / 150%' },
    { size: 'body-md', note: 'Body — 16 / 400 / 150%' },
    { size: 'body-sm', note: 'Small body — 14 / 400 / 150%' },
    { size: 'label-md', note: 'Label — 14 / 600 / 120%' },
    { size: 'label-sm', note: 'Label small — 12 / 600 / 120%' },
    { size: 'description', note: 'Description — 12 / 400 / 150%' },
] as const

const SCALE_KEYS = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const SPACING_KEYS = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const

const Swatch = ({ color, label, sub }: { color: string; label: string; sub?: string }) => (
    <Stack gap={4}>
        <Box style={{ background: color, height: 56, borderRadius: 2, border: '1px solid #0001' }} />
        <Text size="description" c="dimmed">
            {label}
        </Text>
        {sub ? (
            <Text size="description" c="dimmed">
                {sub}
            </Text>
        ) : null}
    </Stack>
)

export const ColorRamps: Story = () => {
    const theme = useMantineTheme()

    return (
        <Stack p="xl" gap="xl">
            <Heading size="page-sm">Color primitives</Heading>
            <Text size="body-sm" c="dimmed">
                Ramps are named 50-900 in the handoff and map onto Mantine index 0-9 in order. Grey and Purple carry an
                extra 950 step, kept in slot 10.
            </Text>
            {RAMPS.map((ramp) => (
                <Stack key={ramp} gap="xs">
                    <Text size="body-md" fw={700}>
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
        <Heading size="page-sm">Semantic tokens</Heading>
        <Text size="body-sm" c="dimmed">
            Each token is bound to a primitive exactly as the handoff file states it — these are not inferred. Labels
            show the binding so a mismatch is visible here rather than in the app.
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
        <Heading size="page-sm">Type scale</Heading>
        <Text size="body-sm" c="dimmed">
            Open Sans. Names mirror the handoff’s composed type styles. Line heights are the three primitives (1.2 /
            1.35 / 1.5) the handoff defines.
        </Text>
        {HEADING_SPECS.map(({ size, note }) => (
            <Stack key={size} gap={2}>
                <Heading size={size}>The quick brown fox ({size})</Heading>
                <Text size="description" c="dimmed">
                    {note}
                </Text>
            </Stack>
        ))}
        {TEXT_SPECS.map(({ size, note }) => (
            <Stack key={size} gap={2}>
                <Text size={size}>The quick brown fox jumps over the lazy dog ({size})</Text>
                <Text size="description" c="dimmed">
                    {note}
                </Text>
            </Stack>
        ))}
        <Stack gap={2}>
            <Text size="body-md" fw={400}>
                Body 16 Regular (400)
            </Text>
            <Text size="body-md" fw={600}>
                Body 16 Semi-bold (600)
            </Text>
            <Text size="body-md" fw={700}>
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
                <Heading size="page-sm">Corner radius</Heading>
                <Group gap="lg">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Box
                                w={80}
                                h={80}
                                style={{ background: theme.colors.purple[5], borderRadius: theme.radius[key] }}
                            />
                            <Text size="description" c="dimmed">
                                {key} · {theme.radius[key]}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Heading size="page-sm">Shadows</Heading>
                <Text size="body-sm" c="dimmed">
                    The handoff defines shadows as separate blur/spread/offset/opacity parts with no color; these
                    compose them over black.
                </Text>
                <Group gap="xl">
                    {SCALE_KEYS.map((key) => (
                        <Stack key={key} gap={4} align="center">
                            <Paper w={100} h={80} shadow={key} radius="xs" />
                            <Text size="description" c="dimmed">
                                {key}
                            </Text>
                        </Stack>
                    ))}
                </Group>
            </Stack>

            <Stack gap="xs">
                <Heading size="page-sm">Spacing</Heading>
                {SPACING_KEYS.map((key) => (
                    <Group key={key} gap="sm" align="center">
                        <Text size="description" c="dimmed" w={80}>
                            {key} · {theme.spacing[key]}
                        </Text>
                        <Box h={16} w={theme.spacing[key]} style={{ background: theme.colors.turquoise[5] }} />
                    </Group>
                ))}
            </Stack>
        </Stack>
    )
}
