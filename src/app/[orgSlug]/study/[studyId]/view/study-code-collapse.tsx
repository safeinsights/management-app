'use client'

import { forwardRef } from 'react'
import { type MantineSpacing } from '@mantine/core'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'

export type StudyCodeToggleLabels = { expand: string; collapse: string }

export const DEFAULT_STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
    expand: 'View submitted study code',
    collapse: 'Hide submitted study code',
}

export const FULL_STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
    expand: 'View full study code',
    collapse: 'Hide full study code',
}

interface StudyCodeToggleProps {
    expanded: boolean
    onClick: () => void
    isVisible?: boolean
    mt?: MantineSpacing
    labels?: StudyCodeToggleLabels
    testId?: string
}

// Keeps the default link color rather than the navy of the proposal and feedback toggles, which
// OTTER-755 recolors on their own.
export const StudyCodeToggle = forwardRef<HTMLButtonElement, StudyCodeToggleProps>(function StudyCodeToggle(
    {
        expanded,
        onClick,
        isVisible = true,
        mt,
        labels = DEFAULT_STUDY_CODE_TOGGLE_LABELS,
        testId = 'study-code-toggle',
    },
    ref,
) {
    const label = expanded ? labels.collapse : labels.expand

    return (
        <CollapseToggleLink
            ref={ref}
            label={label}
            isExpanded={expanded}
            onClick={onClick}
            isVisible={isVisible}
            mt={mt}
            testId={testId}
            c="var(--mantine-color-anchor)"
        />
    )
})
