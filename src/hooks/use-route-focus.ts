import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { MAIN_CONTENT_ID } from '@/lib/constants'

// A page that focuses its own control on arrival (an autofocused input, an open modal) keeps it;
// a link left behind in the navbar, or the body once the old page unmounted, does not count.
function pageOwnsFocus(main: HTMLElement, active: Element | null): boolean {
    if (!active || active === document.body) return false
    return main.contains(active) || active.closest('[role="dialog"]') !== null
}

// False when no main has rendered yet, so the caller can wait for one.
function focusMainContent(): boolean {
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (!main) return false
    // Next already scrolls the new page into place; focusing must not move it again.
    if (!pageOwnsFocus(main, document.activeElement)) main.focus({ preventScroll: true })
    return true
}

// Keyed on the pathname alone, so a query-string change (tabs, filters, returnTo) is not a
// navigation. The ref starts at the first pathname, which leaves the initial load to the browser.
export function useRouteFocus() {
    const pathname = usePathname()
    const previousPathname = useRef(pathname)

    useEffect(() => {
        if (previousPathname.current === pathname) return
        previousPathname.current = pathname
        if (focusMainContent()) return

        // The 404 and error screens mount their main a render after the route commits: the page
        // throws, the boundary catches, and the fallback renders on the next pass.
        const observer = new MutationObserver(() => {
            if (focusMainContent()) observer.disconnect()
        })
        observer.observe(document.body, { childList: true, subtree: true })
        return () => observer.disconnect()
    }, [pathname])
}
