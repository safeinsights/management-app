'use client'

import { FC, ReactNode, useId } from 'react'
import { Stack, Text } from '@mantine/core'

interface ReadOnlyFieldProps {
    label: string
    /** Rendered as-is. Callers resolve stored values (slugs, enums) to their display labels first. */
    value: ReactNode
}

// Plain text by design (Figma 530-26257, 530-26405), so nothing carries `disabled`. A named group is
// the ARIA stand-in OTTER-764 asks for: one announcement of label, value and unavailable state. The
// `tabIndex={-1}` is inert on a div and stays only because the card pairs it with `aria-disabled`.
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
