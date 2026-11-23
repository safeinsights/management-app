import { Anchor, Group, Stack, Text } from '@mantine/core'
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

type ExpandToggleProps = {
    isExpanded: boolean
    onToggle: () => void
    showLabel: string
    hideLabel: string
    testId: string
}

function ExpandToggle({ isExpanded, onToggle, showLabel, hideLabel, testId }: ExpandToggleProps) {
    return (
        <Anchor
            component="button"
            type="button"
            onClick={onToggle}
            size="sm"
            fw={fontWeight.bold}
            w="fit-content"
            data-testid={testId}
            aria-expanded={isExpanded}
        >
            <Group component="span" gap="xxs" wrap="nowrap">
                {isExpanded ? hideLabel : showLabel}
                <ToggleChevron isExpanded={isExpanded} />
            </Group>
        </Anchor>
    )
}

type ExpandableDetailsProps = {
    // Prefix for the `-body` and `-toggle` test ids.
    testId: string
    showLabel: string
    hideLabel: string
    children: ReactNode
}

export function ExpandableDetails({ testId, showLabel, hideLabel, children }: ExpandableDetailsProps) {
    const { isExpanded, toggle } = useExpandToggle()
    return (
        <Stack gap="xs" p="md" bd={`1px solid ${semanticColor('border.default')}`} bdrs="xs">
            <Text
                component="div"
                size="sm"
                data-testid={`${testId}-body`}
                lineClamp={isExpanded ? undefined : COLLAPSED_LINE_CLAMP}
            >
                {children}
            </Text>
            <ExpandToggle
                isExpanded={isExpanded}
                onToggle={toggle}
                showLabel={showLabel}
                hideLabel={hideLabel}
                testId={`${testId}-toggle`}
            />
        </Stack>
    )
}
