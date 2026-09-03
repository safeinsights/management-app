import type { FC, ReactNode } from 'react'
import { Stack, Text, Title } from '@mantine/core'

// Reserved even when empty so the H1 sits at the same height on every page. An empty block box
// builds no line box and would measure zero, and `1lh` is one line box of this element's own
// computed line-height, so it tracks the font size with no separate value to keep in sync. Nothing
// is added to the DOM, so an empty eyebrow still has no text a screen reader could announce.
const Eyebrow: FC<{ text?: string | null }> = ({ text }) => (
    <Text fz="sm" fw={600} c="charcoal.6" tt="uppercase" mih="1lh" data-testid="page-header-eyebrow">
        {text}
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
