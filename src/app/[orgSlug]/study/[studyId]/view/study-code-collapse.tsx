'use client'

import { forwardRef, useCallback, useState } from 'react'
import { Anchor, type MantineSpacing } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'

export function useExpandable(initial = false) {
    const [expanded, setExpanded] = useState(initial)
    const toggle = useCallback(() => setExpanded((prev) => !prev), [])
    const collapse = useCallback(() => setExpanded(false), [])
    return { expanded, toggle, collapse }
}

export type StudyCodeToggleLabels = { expand: string; collapse: string }

export const DEFAULT_STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
    expand: 'View submitted study code',
    collapse: 'Hide submitted study code',
}

interface StudyCodeToggleProps {
    expanded: boolean
    onClick: () => void
    isVisible?: boolean
    mt?: MantineSpacing
    labels?: StudyCodeToggleLabels
    /** Override the test id so multiple toggles on one page stay distinct. */
    testId?: string
}

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
    if (!isVisible) return null
    return (
        <Anchor
            component="button"
            type="button"
            size="sm"
            fw={700}
            onClick={onClick}
            mt={mt}
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4 }}
            aria-expanded={expanded}
            data-testid={testId}
            ref={ref}
        >
            {expanded ? labels.collapse : labels.expand}
            <CaretRightIcon size={12} weight="bold" style={{ transform: expanded ? 'rotate(-90deg)' : undefined }} />
        </Anchor>
    )
})
