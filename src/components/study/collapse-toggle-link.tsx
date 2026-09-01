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
    /** Where a section swaps its content, the unmounted toggle would otherwise drop focus to
     * the body; the toggle in the other state claims it instead. */
    autoFocus?: boolean
    c?: MantineColor
}

export const CollapseToggleLink = forwardRef<HTMLButtonElement, CollapseToggleLinkProps>(function CollapseToggleLink(
    { label, isExpanded, onClick, isVisible = true, testId, mt, autoFocus, c = 'blue.10' },
    ref,
) {
    if (!isVisible) return null

    return (
        <Anchor
            component="button"
            // Anchor renders a real <button>, which would default to type="submit" and submit
            // the reviewer decision form when the proposal is collapsed.
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
