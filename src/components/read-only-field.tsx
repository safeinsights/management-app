'use client'

import { FC, ReactNode } from 'react'
import { Stack, Text } from '@mantine/core'

interface ReadOnlyFieldProps {
    label: string
    /** Rendered as-is. Callers resolve stored values (slugs, enums) to their display labels first. */
    value: ReactNode
}

/**
 * Label over value, for a field the user can see but not change. Mirrors the layout the
 * submitted-proposal views already use (`proposal-fields.tsx`) so the two do not drift.
 *
 * No required asterisk and no ARIA field chrome: there is no control here, so there is nothing
 * to mark required or to describe. It is text, and it is read as text.
 */
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
