'use client'

import { useEffect } from 'react'

// Readiness signal for e2e (goto in tests/e2e.helpers.ts). It must render inside the root Suspense
// boundary: a dehydrated boundary hydrates in its own later pass, so a flag set from the shell
// reads true while the page's client components still drop clicks.
export function HydrationMarker() {
    useEffect(() => {
        window.isReactHydrated = true
    }, [])

    return null
}
