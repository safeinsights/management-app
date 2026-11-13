import type { ReactNode } from 'react'
import { type MantineSpacing, Stack } from '@mantine/core'

type StudyPageLayoutProps = {
    header: ReactNode
    /** Between the sections under the header. */
    gap?: MantineSpacing
    children: ReactNode
}

// Page header spec: 40px above the eyebrow and 32px from the header to the first card, whatever
// gap the page keeps between its own cards.
export function StudyPageLayout({ header, gap = 'xxl', children }: StudyPageLayoutProps) {
    return (
        <Stack px="xl" pt="xxl" pb="xl" gap="xl">
            {header}
            <Stack gap={gap}>{children}</Stack>
        </Stack>
    )
}
