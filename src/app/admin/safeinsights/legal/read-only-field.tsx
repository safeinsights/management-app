import type { FC } from '@/common'
import { Stack, Text } from '@mantine/core'

export const ReadOnlyField: FC<{ label: string; value: string }> = ({ label, value }) => (
    <Stack gap={2}>
        <Text size="sm" fw={500}>
            {label}
        </Text>
        <Text>{value}</Text>
    </Stack>
)
