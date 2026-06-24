'use client'

import { useCallback, useState, type FC } from 'react'
import { Anchor, type MantineSpacing } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'

export function useExpandable(initial = false) {
    const [expanded, setExpanded] = useState(initial)
    const toggle = useCallback(() => setExpanded((prev) => !prev), [])
    const collapse = useCallback(() => setExpanded(false), [])
    return { expanded, toggle, collapse }
}

interface StudyCodeToggleProps {
    expanded: boolean
    onClick: () => void
    isVisible?: boolean
    mt?: MantineSpacing
    /** Override the test id so multiple toggles on one page (e.g. an in-card opener and an in-panel closer) stay distinct. */
    testId?: string
}

export const StudyCodeToggle: FC<StudyCodeToggleProps> = ({
    expanded,
    onClick,
    isVisible = true,
    mt,
    testId = 'study-code-toggle',
}) => {
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
        >
            {expanded ? 'Hide submitted study code' : 'View submitted study code'}
            <CaretRightIcon size={12} weight="bold" style={{ transform: expanded ? 'rotate(-90deg)' : undefined }} />
        </Anchor>
    )
}
