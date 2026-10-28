import { useEffect, useState } from 'react'
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

// VoiceOver drops an alert that lands with useRouteFocus's move to main and says only "main".
// Safari needed under 100 ms in testing; this leaves margin.
export const ANNOUNCEMENT_DELAY_MS = 300

// Next commits a page's <title> after the page and announces before it lands (OTTER-823). One
// observer for the app's lifetime sees every title change, so it never misses one between routes.
export function useRouteAnnouncement(): string {
    const [announcement, setAnnouncement] = useState('')

    useEffect(() => {
        let lastTitle = document.title
        let pending: ReturnType<typeof setTimeout> | undefined
        const observer = new MutationObserver((records) => {
            const title = pageTitle()
            if (!records.some(touchesTitle) || !title || title === lastTitle) return
            lastTitle = title
            clearTimeout(pending)
            pending = setTimeout(() => setAnnouncement(title), ANNOUNCEMENT_DELAY_MS)
        })
        observer.observe(document.head, { childList: true, subtree: true, characterData: true })
        return () => {
            observer.disconnect()
            clearTimeout(pending)
        }
    }, [])

    return announcement
}
