import { Anchor, Group, ScrollArea, Stack, Text, type MantineSpacing } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import { ToggleChevron } from '@/components/icons'
import { fontWeight, semanticColor } from '@/theme/tokens'

export function AnalysisPanel({
    title,
    description,
    testId,
    children,
}: {
    title: string
    description: string
    testId: string
    children: ReactNode
}) {
    return (
        <Stack gap="lg" data-testid={testId}>
            <Stack gap="xxs">
                <Text fw={fontWeight.bold}>{title}</Text>
                <Text size="xs" c="dimmed">
                    {description}
                </Text>
            </Stack>
            {children}
        </Stack>
    )
}

const COLLAPSED_LINE_CLAMP = 2

function useExpandToggle() {
    const [isExpanded, setIsExpanded] = useState(false)
    return { isExpanded, toggle: () => setIsExpanded((v) => !v) }
}

export function DetailsBox({
    gap = 'xs',
    testId,
    children,
}: {
    gap?: MantineSpacing
    testId?: string
    children: ReactNode
}) {
    return (
        <Stack gap={gap} p="md" bd={`1px solid ${semanticColor('border.default')}`} bdrs="xs" data-testid={testId}>
            {children}
        </Stack>
    )
}

type TextButtonProps = {
    onClick: () => void
    testId: string
    children: ReactNode
    leftSection?: ReactNode
    rightSection?: ReactNode
    disabled?: boolean
    'aria-expanded'?: boolean
    'aria-busy'?: boolean
}

export function TextButton({ onClick, testId, children, leftSection, rightSection, ...rest }: TextButtonProps) {
    return (
        <Anchor
            component="button"
            type="button"
            onClick={onClick}
            size="sm"
            fw={fontWeight.bold}
            w="fit-content"
            data-testid={testId}
            {...rest}
        >
            <Group component="span" gap="xxs" wrap="nowrap">
                {leftSection}
                {children}
                {rightSection}
            </Group>
        </Anchor>
    )
}

type ExpandToggleProps = {
    isExpanded: boolean
    onToggle: () => void
    showLabel: string
    hideLabel: string
    testId: string
}

function ExpandToggle({ isExpanded, onToggle, showLabel, hideLabel, testId }: ExpandToggleProps) {
    return (
        <TextButton
            onClick={onToggle}
            testId={testId}
            aria-expanded={isExpanded}
            rightSection={<ToggleChevron isExpanded={isExpanded} />}
        >
            {isExpanded ? hideLabel : showLabel}
        </TextButton>
    )
}

// A scroll area that never scrolls would still be a tab stop, so it takes focus only while it overflows.
function useOverflowTabStop() {
    const [isOverflowing, setIsOverflowing] = useState(false)
    return { tabIndex: isOverflowing ? 0 : undefined, onOverflowChange: setIsOverflowing }
}

type ExpandableBodyProps = {
    testId: string
    isExpanded: boolean
    expandedMaxHeight?: number
    scrollLabel?: string
    children: ReactNode
}

function ExpandableBody({ testId, isExpanded, expandedMaxHeight, scrollLabel, children }: ExpandableBodyProps) {
    const overflowTabStop = useOverflowTabStop()
    const body = (
        <Text
            component="div"
            size="sm"
            data-testid={`${testId}-body`}
            lineClamp={isExpanded ? undefined : COLLAPSED_LINE_CLAMP}
        >
            {children}
        </Text>
    )
    if (!isExpanded || expandedMaxHeight == null) return body
    return (
        <ScrollArea.Autosize
            mah={expandedMaxHeight}
            type="auto"
            offsetScrollbars="present"
            scrollbarSize={8}
            aria-label={scrollLabel}
            data-testid={`${testId}-scroll`}
            {...overflowTabStop}
        >
            {body}
        </ScrollArea.Autosize>
    )
}

type ExpandableDetailsProps = {
    // Prefix for the `-body`, `-toggle` and `-scroll` test ids.
    testId: string
    showLabel: string
    hideLabel: string
    // Expanded content taller than this scrolls inside the box; without it the box grows to fit.
    expandedMaxHeight?: number
    scrollLabel?: string
    children: ReactNode
}

export function ExpandableDetails({
    testId,
    showLabel,
    hideLabel,
    expandedMaxHeight,
    scrollLabel,
    children,
}: ExpandableDetailsProps) {
    const { isExpanded, toggle } = useExpandToggle()
    return (
        <DetailsBox>
            <ExpandableBody
                testId={testId}
                isExpanded={isExpanded}
                expandedMaxHeight={expandedMaxHeight}
                scrollLabel={scrollLabel}
            >
                {children}
            </ExpandableBody>
            <ExpandToggle
                isExpanded={isExpanded}
                onToggle={toggle}
                showLabel={showLabel}
                hideLabel={hideLabel}
                testId={`${testId}-toggle`}
            />
        </DetailsBox>
    )
}
