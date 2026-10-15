import type { FC, ReactNode } from 'react'
import { Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { fontWeight, semanticColor } from '@/theme/tokens'

// Reserved even when empty so the H1 sits at the same height on every page. An empty block box
// builds no line box and would measure zero, and `1lh` is one line box of this element's own
// computed line-height, so it tracks the font size with no separate value to keep in sync. Nothing
// is added to the DOM, so an empty eyebrow still has no text a screen reader could announce.
const Eyebrow: FC<{ text?: string | null }> = ({ text }) => (
    <Text fz="sm" fw={fontWeight.semibold} c="charcoal.6" tt="uppercase" mih="1lh" data-testid="page-header-eyebrow">
        {text}
    </Text>
)

// The pair a page's step card shows ("Step 3" / "Submit code").
export type PageHeaderStep = { label: string; heading: string }

// The visible H1 is the study title alone, so a screen reader would otherwise hear the same heading
// on every step of the study (OTTER-823).
const HiddenStep: FC<{ step?: PageHeaderStep }> = ({ step }) => {
    if (!step) return null

    return (
        <VisuallyHidden component="span">
            {' '}
            — {step.label}: {step.heading}
        </VisuallyHidden>
    )
}

export interface PageHeaderProps {
    title: ReactNode
    // Rendered uppercase by CSS, so screen readers still read the original casing.
    eyebrow?: string | null
    step?: PageHeaderStep
}

export const PageHeader: FC<PageHeaderProps> = ({ title, eyebrow, step }) => (
    <Stack gap="xs">
        <Eyebrow text={eyebrow} />
        <Title order={1} c={semanticColor('text.header')}>
            {title}
            <HiddenStep step={step} />
        </Title>
    </Stack>
)
