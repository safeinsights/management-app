import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { MAIN_CONTENT_ID } from '@/lib/constants'

// A page that focuses its own control on arrival (an autofocused input, an open modal) keeps it;
// a link left behind in the navbar, or the body once the old page unmounted, does not count.
function pageOwnsFocus(main: HTMLElement, active: Element | null): boolean {
    if (!active || active === document.body) return false
    return main.contains(active) || active.closest('[role="dialog"]') !== null
}

function focusMainContent() {
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (!main || pageOwnsFocus(main, document.activeElement)) return
    // Next already scrolls the new page into place; focusing must not move it again.
    main.focus({ preventScroll: true })
}

// Keyed on the pathname alone, so a query-string change (tabs, filters, returnTo) is not a
// navigation. The ref starts at the first pathname, which leaves the initial load to the browser.
export function useRouteFocus() {
    const pathname = usePathname()
    const previousPathname = useRef(pathname)

    useEffect(() => {
        if (previousPathname.current === pathname) return
        previousPathname.current = pathname
        focusMainContent()
    }, [pathname])
}
