import type { FC } from '@/common'
import { Stack, Text } from '@mantine/core'

// A value the admin is publishing but cannot edit here — the org or study an agreement belongs to,
// and the same values repeated back in the publish confirmation.
export const ReadOnlyField: FC<{ label: string; value: string }> = ({ label, value }) => (
    <Stack gap={2}>
        <Text size="sm" fw={500}>
            {label}
        </Text>
        <Text>{value}</Text>
    </Stack>
)
