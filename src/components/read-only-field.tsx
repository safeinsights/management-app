'use client'

import { FC, ReactNode, useId } from 'react'
import { Stack, Text } from '@mantine/core'

interface ReadOnlyFieldProps {
    label: string
    /** Rendered as-is. Callers resolve stored values (slugs, enums) to their display labels first. */
    value: ReactNode
}

// A locked field is plain text by design (Figma 530-26257, 530-26405), so there is no control to
// carry `disabled`. A named group is the ARIA-valid stand-in OTTER-764 asks for: it binds the label
// to the value as one announcement instead of two loose text runs, and marks it unavailable.
export const ReadOnlyField: FC<ReadOnlyFieldProps> = ({ label, value }) => {
    const labelId = useId()

    return (
        <Stack gap={4} role="group" aria-labelledby={labelId} aria-disabled="true" tabIndex={-1}>
            <Text id={labelId} fw={600} size="sm">
                {label}
            </Text>
            <Text size="md" fw={400}>
                {value}
            </Text>
        </Stack>
    )
}
