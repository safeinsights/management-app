'use client'

import { type FC, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core'
import { fontWeight, semanticColor } from '@/theme/tokens'

// The tooltip is only offered once text is cut off, so short text gets none.
const useIsTruncated = <T extends HTMLElement>(text?: string | null): [RefObject<T | null>, boolean] => {
    const ref = useRef<T>(null)
    const [isTruncated, setIsTruncated] = useState(false)

    useEffect(() => {
        const node = ref.current
        if (!node) return

        const check = () => setIsTruncated(node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)

        check()
        const observer = new ResizeObserver(check)
        observer.observe(node)
        return () => observer.disconnect()
    }, [text])

    return [ref, isTruncated]
}

// Reserved even when empty so the H1 sits at the same height on every page. An empty block box
// builds no line box and would measure zero, and `1lh` is one line box of this element's own
// computed line-height, so it tracks the font size with no separate value to keep in sync. Nothing
// is added to the DOM, so an empty eyebrow still has no text a screen reader could announce.
const Eyebrow: FC<{ text?: string | null }> = ({ text }) => {
    const [ref, isTruncated] = useIsTruncated<HTMLParagraphElement>(text)

    return (
        <Tooltip
            label={text}
            disabled={!isTruncated}
            events={{ hover: true, focus: true, touch: true }}
            multiline
            maw={400}
        >
            <Text
                ref={ref}
                fz="sm"
                fw={fontWeight.semibold}
                c={semanticColor('text.secondary')}
                tt="uppercase"
                mih="1lh"
                // The header stack sizes its children to their content, so without a cap a long name never truncates.
                maw="100%"
                truncate="end"
                data-testid="page-header-eyebrow"
            >
                {text}
            </Text>
        </Tooltip>
    )
}

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
    title: string
    // Rendered uppercase by CSS, so screen readers still read the original casing.
    eyebrow?: string | null
    step?: PageHeaderStep
    // Sits under the H1 rather than inside it, so the clamp and the heading's name cover the title alone.
    badge?: ReactNode
}

export const PageHeader: FC<PageHeaderProps> = ({ title, eyebrow, step, badge }) => {
    const [titleRef, isTitleTruncated] = useIsTruncated<HTMLHeadingElement>(title)

    return (
        <Stack gap="xs" align="flex-start">
            <Eyebrow text={eyebrow} />
            <Tooltip
                label={title}
                disabled={!isTitleTruncated}
                events={{ hover: true, focus: true, touch: true }}
                multiline
                maw={400}
            >
                <Title
                    ref={titleRef}
                    order={1}
                    c={semanticColor('text.header')}
                    maw={760}
                    lh="var(--si-line-height-heading)"
                    lineClamp={2}
                >
                    {title}
                    <HiddenStep step={step} />
                </Title>
            </Tooltip>
            {badge}
        </Stack>
    )
}
