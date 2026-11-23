import type { FC } from 'react'
import { Text } from '@mantine/core'
import { fontWeight } from '@/theme/tokens'

// Reviewer banners and modals set the Research Lab's name in semibold within their sentence.
export const LabName: FC<{ children: string }> = ({ children }) => (
    <Text span inherit fw={fontWeight.semibold}>
        {children}
    </Text>
)
