import type { FC } from 'react'
import { Text } from '@mantine/core'
import { fontWeight } from '@/theme/tokens'

// Banners and modals set a Research Lab's or Data Partner's name in semibold within their sentence.
export const OrgName: FC<{ children: string }> = ({ children }) => (
    <Text span inherit fw={fontWeight.semibold}>
        {children}
    </Text>
)
