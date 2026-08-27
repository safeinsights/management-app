'use client'

import { Anchor, type MantineSpacing } from '@mantine/core'
import { ToggleChevron } from '@/components/icons'

type CollapseToggleLinkProps = {
    label: string
    isExpanded: boolean
    onClick: () => void
    isVisible?: boolean
    testId?: string
    mt?: MantineSpacing
}

/**
 * The expand/collapse control shared by the proposal cards and the feedback entries. Both read
 * `brand/default` (#01215E = blue.10) rather than the purple Anchor default (OTTER-755).
 */
export function CollapseToggleLink({
    label,
    isExpanded,
    onClick,
    isVisible = true,
    testId,
    mt,
}: CollapseToggleLinkProps) {
    if (!isVisible) return null

    return (
        <Anchor
            component="button"
            // Anchor renders a real <button>, which defaults to type="submit", so the reviewer
            // decision form would submit when the proposal is collapsed.
            type="button"
            size="sm"
            fw={700}
            c="blue.10"
            mt={mt}
            onClick={onClick}
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4 }}
            aria-expanded={isExpanded}
            data-testid={testId}
        >
            {label}
            <ToggleChevron isExpanded={isExpanded} />
        </Anchor>
    )
}
