'use client'

import { useRef } from 'react'
import { openLinkInNewTab, useFocusOnOpen } from './link-card-interactions'
import { LinkHoverCard } from './link-hover-card'
import { useLinkPreview } from './use-link-preview'

/** The card body for read-only links, in the editor and on plain links alike. `url` is absolute. */
export function ReadOnlyLinkCardBody({ url, opensInNewTab }: { url: string; opensInNewTab: boolean }) {
    const firstActionRef = useRef<HTMLButtonElement>(null)

    useFocusOnOpen(firstActionRef)

    const preview = useLinkPreview(url)
    const openInNewTab = () => openLinkInNewTab(url)

    return (
        <LinkHoverCard
            preview={preview}
            mode="readOnly"
            opensInNewTab={opensInNewTab}
            firstActionRef={firstActionRef}
            onOpenInNewTab={openInNewTab}
        />
    )
}
