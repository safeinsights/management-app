'use client'

import { useQuery } from '@/common'
import { resolveInternalLinkAction } from '@/server/actions/link-preview.actions'
import { currentOrigin, internalPathname, type LinkPreview } from './link-preview'

const PREVIEW_STALE_MS = 5 * 60 * 1000

/**
 * What the card should say about `href`. An external link is answered on the spot; an internal one
 * asks the server for the destination's name, and falls back to showing the URL when the
 * destination is a page with no name of its own.
 */
export function useLinkPreview(href: string): LinkPreview {
    const pathname = internalPathname(href, currentOrigin())

    const query = useQuery({
        queryKey: ['link-preview', pathname],
        queryFn: () => resolveInternalLinkAction({ pathname: pathname! }),
        enabled: pathname !== null,
        staleTime: PREVIEW_STALE_MS,
        retry: false,
    })

    if (pathname === null) return { kind: 'external', href }
    if (query.isPending) return { kind: 'loading', href }
    if (query.isError || !query.data || query.data.kind === 'unavailable') return { kind: 'unavailable', href }
    if (query.data.kind === 'unknown') return { kind: 'external', href }

    return { kind: 'internal', href, title: query.data.title, category: query.data.category }
}
