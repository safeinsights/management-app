'use client'

import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { fontWeight } from '@/theme/tokens'

interface DisplayFieldProps {
    label: string
    children: ReactNode
}

export function DisplayField({ label, children }: DisplayFieldProps) {
    return (
        <div>
            <Text fw={fontWeight.semibold} size="sm" mb="xxs">
                {label}
            </Text>
            {children}
        </div>
    )
}
