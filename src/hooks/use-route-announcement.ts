import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { APP_TITLE } from '@/lib/constants'

// The bare default shows only while Next swaps in the page's own head; every route names itself.
function pageTitle(): string {
    return document.title === APP_TITLE ? '' : document.title
}

const isTitle = (node: Node | null) => node?.nodeName === 'TITLE'

// A <title> added or its text changed. A removal alone can expose a title left from the last page.
function touchesTitle(record: MutationRecord): boolean {
    return isTitle(record.target) || isTitle(record.target.parentNode) || Array.from(record.addedNodes).some(isTitle)
}

// Next commits a page's <title> after the page and announces before it lands (OTTER-823). Keyed on
// the pathname like useRouteFocus, so a query-string change is not a navigation.
export function useRouteAnnouncement(): string {
    const pathname = usePathname()
    const previousPathname = useRef(pathname)
    const lastTitle = useRef<string | null>(null)
    const [announcement, setAnnouncement] = useState('')

    useEffect(() => {
        lastTitle.current ??= document.title
        if (previousPathname.current === pathname) return
        previousPathname.current = pathname

        const announce = (title: string) => {
            lastTitle.current = title
            setAnnouncement(title)
        }

        // The last page's title still in place is not an arrival; wait until the head changes it.
        const title = pageTitle()
        if (title && title !== lastTitle.current) announce(title)

        // Stays connected until the next navigation, so a later retitle (the error screen) is heard too.
        const observer = new MutationObserver((records) => {
            const current = pageTitle()
            if (current && records.some(touchesTitle)) announce(current)
        })
        observer.observe(document.head, { childList: true, subtree: true, characterData: true })
        return () => observer.disconnect()
    }, [pathname])

    return announcement
}
