import type { FC, ReactNode } from 'react'
import { Stack, Text, Title } from '@mantine/core'

// An empty block box has no inline content to build a line box from, so it measures zero. A
// non-breaking space gives the slot the exact height a real eyebrow takes, with no value to keep in
// sync, and hiding the empty slot stops a screen reader announcing the blank line it introduces.
const Eyebrow: FC<{ text?: string | null }> = ({ text }) => (
    <Text fz="sm" fw={600} c="charcoal.6" tt="uppercase" data-testid="page-header-eyebrow" aria-hidden={!text}>
        {text || '\u00a0'}
    </Text>
)

export interface PageHeaderProps {
    title: ReactNode
    // Rendered uppercase by CSS, so screen readers still read the original casing.
    eyebrow?: string | null
}

export const PageHeader: FC<PageHeaderProps> = ({ title, eyebrow }) => (
    <Stack gap="xs">
        <Eyebrow text={eyebrow} />
        <Title order={1} c="navy.5">
            {title}
        </Title>
    </Stack>
)
