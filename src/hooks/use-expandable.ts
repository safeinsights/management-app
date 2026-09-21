import { useCallback, useState } from 'react'

// `collapse` is separate from `toggle` because the section can also be closed from inside it.
export function useExpandable(initial = false) {
    const [expanded, setExpanded] = useState(initial)
    const toggle = useCallback(() => setExpanded((prev) => !prev), [])
    const collapse = useCallback(() => setExpanded(false), [])
    return { expanded, toggle, collapse }
}
