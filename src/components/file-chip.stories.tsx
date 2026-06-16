import type { Story } from '@ladle/react'
import { Group, Stack, Text } from '@mantine/core'
import { FileChip } from './file-chip'

// FileChip renders a downloadable badge. Filenames longer than 20 chars are
// truncated and gain a hover tooltip showing the full name.
const meta = { title: 'Components / File chip' }
export default meta

const href = 'https://example.com/download/file'

export const ShortFilename: Story = () => (
    <Group p="xl">
        <FileChip href={href} filename="analysis.R" />
    </Group>
)

export const LongFilenameTruncated: Story = () => (
    <Stack p="xl" align="flex-start" gap="md">
        <Text size="xs" c="dimmed">
            (hover to see the full filename)
        </Text>
        <FileChip href={href} filename="study-results-final-2026-05.csv" />
    </Stack>
)

export const Variants: Story = () => (
    <Group p="xl">
        <FileChip href={href} filename="results.csv" />
        <FileChip href={href} filename="main-analysis-code.py" />
        <FileChip href={href} filename="supplemental_data_table.parquet" />
    </Group>
)
