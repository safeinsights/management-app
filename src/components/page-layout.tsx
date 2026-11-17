import type { ReactNode } from 'react'
import { type MantineSpacing, Stack } from '@mantine/core'

type PageLayoutProps = {
    header: ReactNode
    /** Between the sections under the header. */
    gap?: MantineSpacing
    px?: MantineSpacing
    pb?: MantineSpacing
    children: ReactNode
}

// Page header spec: 40px above the eyebrow and 32px from the header to the first card, whatever
// gap the page keeps between its own cards.
export function PageLayout({ header, gap = 'xxl', px = 'xl', pb = 'xl', children }: PageLayoutProps) {
    return (
        <Stack px={px} pt="xxl" pb={pb} gap="xl">
            {header}
            <Stack gap={gap}>{children}</Stack>
        </Stack>
    )
}
