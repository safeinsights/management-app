'use client'

import { Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface DisplayFieldProps {
    label: string
    children: ReactNode
}

export function DisplayField({ label, children }: DisplayFieldProps) {
    return (
        <div>
            <Text fw={600} size="sm" mb={4}>
                {label}
            </Text>
            {children}
        </div>
    )
}
