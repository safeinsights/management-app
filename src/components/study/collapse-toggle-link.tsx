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
    /**
     * Take focus when this control mounts. A section that swaps its content rather than hiding it
     * unmounts the toggle that was just clicked, which would drop keyboard and screen-reader users
     * on the document body; the equivalent toggle in the other state claims the focus instead.
     */
    autoFocus?: boolean
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
    autoFocus,
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
            autoFocus={autoFocus}
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
