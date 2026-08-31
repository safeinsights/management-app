import { useCallback, useState } from 'react'

/**
 * Expand/collapse state for a section whose toggle can also be closed from inside it, which is why
 * `collapse` is separate from `toggle`.
 */
export function useExpandable(initial = false) {
    const [expanded, setExpanded] = useState(initial)
    const toggle = useCallback(() => setExpanded((prev) => !prev), [])
    const collapse = useCallback(() => setExpanded(false), [])
    return { expanded, toggle, collapse }
}
