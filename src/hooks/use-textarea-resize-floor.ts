'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Options = {
    /** Caps auto-growth only. A manual drag may still go past it, which the card allows. */
    maxRows?: number
}

const pxOrZero = (value: string) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Keeps a textarea's min-height at the taller of its `rows` height and its content, so the field
 * grows as the user types and a drag can never take it below either (OTTER-787).
 *
 * Replaces Mantine's `autosize`, which writes `height` with `!important` on every render and so
 * discards a manual drag the next time the content changes.
 */
export function useTextareaResizeFloor({ maxRows }: Options = {}) {
    const ref = useRef<HTMLTextAreaElement>(null)
    const [floor, setFloor] = useState<number | undefined>(undefined)

    const measure = useCallback(() => {
        const el = ref.current
        if (!el) return

        const styles = getComputedStyle(el)
        const border = el.offsetHeight - el.clientHeight

        // Both constraints come off before reading scrollHeight, which never reports less than
        // clientHeight: `height` because a drag may have written a larger one, and `minHeight`
        // because the previous floor would otherwise be what we measure, leaving a field that grows
        // and never shrinks again. Both are restored in the same frame, before paint.
        const draggedHeight = el.style.height
        const previousFloor = el.style.minHeight
        el.style.height = 'auto'
        el.style.minHeight = '0px'
        const content = el.scrollHeight + border
        el.style.height = draggedHeight
        el.style.minHeight = previousFloor

        const rowHeight = parseFloat(styles.lineHeight)
        // Absent padding really is zero, so a zero fallback is right here. An unguarded NaN would
        // travel through the cap into the floor and render as `min-height: NaN`.
        const padding = pxOrZero(styles.paddingTop) + pxOrZero(styles.paddingBottom)
        // `line-height: normal` parses to NaN. Leaving growth uncapped is the safe answer; a zero
        // fallback would collapse the floor to the padding alone.
        const canCap = maxRows !== undefined && Number.isFinite(rowHeight) && rowHeight > 0
        const cap = canCap ? maxRows * rowHeight + padding + border : undefined

        setFloor(cap === undefined ? content : Math.min(content, cap))
    }, [maxRows])

    useEffect(() => {
        const el = ref.current
        if (!el) return

        measure()
        el.addEventListener('input', measure)
        window.addEventListener('resize', measure)
        // A webfont replacing the fallback changes wrapping, and so the content height.
        document.fonts?.ready.then(measure).catch(() => {})

        return () => {
            el.removeEventListener('input', measure)
            window.removeEventListener('resize', measure)
        }
    }, [measure])

    return { ref, floor }
}
