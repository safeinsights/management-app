import type { ReactNode } from 'react'
import { Title, useMantineTheme } from '@mantine/core'

export function StudyPageHeader({ children }: { children: ReactNode }) {
    const theme = useMantineTheme()
    return (
        <Title order={1} fz={40} fw={700} c={theme.colors.charcoal[9]}>
            {children}
        </Title>
    )
}
