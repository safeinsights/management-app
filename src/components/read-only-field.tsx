'use client'

import { FC, ReactNode } from 'react'
import { Stack, Text } from '@mantine/core'

interface ReadOnlyFieldProps {
    label: string
    /** Rendered as-is. Callers resolve stored values (slugs, enums) to their display labels first. */
    value: ReactNode
}

export const ReadOnlyField: FC<ReadOnlyFieldProps> = ({ label, value }) => (
    <Stack gap={4}>
        <Text fw={600} size="sm">
            {label}
        </Text>
        <Text size="md" fw={400}>
            {value}
        </Text>
    </Stack>
)
