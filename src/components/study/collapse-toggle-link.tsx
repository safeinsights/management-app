'use client'

import { forwardRef } from 'react'
import { Anchor, type MantineColor, type MantineSpacing } from '@mantine/core'
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
    /**
     * Overrides `brand/default`. The study code toggles keep the default link color until the
     * ticket that renames them also recolors them (OTTER-755 covers the proposal and the feedback).
     */
    c?: MantineColor
}

/**
 * The one expand/collapse control: the proposal cards, the feedback entries and the study code
 * sections all render this. The proposal and the feedback read `brand/default` (#01215E =
 * blue.10) rather than the purple Anchor default (OTTER-755).
 */
export const CollapseToggleLink = forwardRef<HTMLButtonElement, CollapseToggleLinkProps>(function CollapseToggleLink(
    { label, isExpanded, onClick, isVisible = true, testId, mt, autoFocus, c = 'blue.10' },
    ref,
) {
    if (!isVisible) return null

    return (
        <Anchor
            component="button"
            // Anchor renders a real <button>, which defaults to type="submit", so the reviewer
            // decision form would submit when the proposal is collapsed.
            type="button"
            size="sm"
            fw={700}
            c={c}
            mt={mt}
            autoFocus={autoFocus}
            onClick={onClick}
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4 }}
            aria-expanded={isExpanded}
            data-testid={testId}
            ref={ref}
        >
            {label}
            <ToggleChevron isExpanded={isExpanded} />
        </Anchor>
    )
})
