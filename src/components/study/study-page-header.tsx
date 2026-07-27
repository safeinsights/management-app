import type { ReactNode } from 'react'
import { Title } from '@mantine/core'

export function StudyPageHeader({ children }: { children: ReactNode }) {
    return (
        <Title order={1} fz={40} fw={700} c="charcoal.9">
            {children}
        </Title>
    )
}
