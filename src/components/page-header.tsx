import type { FC, ReactNode } from 'react'
import { Stack, Text, Title } from '@mantine/core'

const EYEBROW_FONT_SIZE = 'sm'
// Reserved even when empty so the H1 sits at the same height on every page, matching the library
// component's hidden-eyebrow variant. Derived from the eyebrow's own font size so the two cannot
// drift. An empty Text is invisible to screen readers.
const EYEBROW_MIN_HEIGHT = `calc(var(--mantine-font-size-${EYEBROW_FONT_SIZE}) * var(--mantine-line-height))`

const Eyebrow: FC<{ text?: string | null }> = ({ text }) => (
    <Text
        fz={EYEBROW_FONT_SIZE}
        fw={600}
        c="charcoal.6"
        tt="uppercase"
        mih={EYEBROW_MIN_HEIGHT}
        data-testid="page-header-eyebrow"
    >
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
