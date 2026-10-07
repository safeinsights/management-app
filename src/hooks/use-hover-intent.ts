import { useCallback, useEffect, useRef, type PointerEvent } from 'react'

// Time for the pointer to cross from the trigger into the card (WCAG 2.1 SC 1.4.13, hover content must be hoverable).
export const HOVER_CLOSE_DELAY_MS = 120

const MOUSE_POINTER = 'mouse'

/**
 * Enter and leave for hover content, with a grace period on leave. Touch and pen are ignored: iOS
 * turns a tap that changes content on hover into a hover only, so the tap would not reach onClick.
 */
export function useHoverIntent({ onEnter, onLeave }: { onEnter: () => void; onLeave: () => void }) {
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pointerInside = useRef(false)

    const cancelLeave = useCallback(() => {
        if (leaveTimer.current === null) return
        clearTimeout(leaveTimer.current)
        leaveTimer.current = null
    }, [])

    useEffect(() => cancelLeave, [cancelLeave])

    const onPointerEnter = useCallback(
        (event: PointerEvent) => {
            if (event.pointerType !== MOUSE_POINTER) return
            pointerInside.current = true
            cancelLeave()
            onEnter()
        },
        [cancelLeave, onEnter],
    )

    const onPointerLeave = useCallback(
        (event: PointerEvent) => {
            if (event.pointerType !== MOUSE_POINTER) return
            pointerInside.current = false
            cancelLeave()
            leaveTimer.current = setTimeout(() => {
                leaveTimer.current = null
                onLeave()
            }, HOVER_CLOSE_DELAY_MS)
        },
        [cancelLeave, onLeave],
    )

    // For a close that is not a pointer leave. A card removed from under the pointer gets no
    // pointerleave, so the flag would otherwise stay set.
    const reset = useCallback(() => {
        cancelLeave()
        pointerInside.current = false
    }, [cancelLeave])

    // A getter, not the ref: a hook result that carries a ref cannot be read during render.
    const isPointerInside = useCallback(() => pointerInside.current, [])

    return { onPointerEnter, onPointerLeave, cancelLeave, reset, isPointerInside }
}
