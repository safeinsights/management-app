'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@mantine/core'
import type { HocuspocusProviderWebsocket, HocuspocusProvider } from '@hocuspocus/provider'

import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { SingleUserEditor } from './single-user-editor'

const CollaborativeEditor = dynamic(() => import('./collaborative-editor').then((mod) => mod.CollaborativeEditor), {
    ssr: false,
})

/**
 * Single entry point for the proposal/review editors. Renders the Yjs-backed
 * CollaborativeEditor by default, or the standalone SingleUserEditor when the
 * app is in single-user mode (a server-read flag exposed via the websocket
 * provider context). The collaborative chunk is loaded lazily, so it isn't
 * pulled into view in single-user mode.
 *
 * Collaboration-only props (`websocketProvider`, `onProviderReady`) are accepted
 * for call-site parity and ignored in single-user mode.
 */
export type EditorProps = {
    id: string
    studyId: string
    /** Serialized Lexical JSON used to seed the single-user editor. */
    initialValue?: string
    websocketProvider?: HocuspocusProviderWebsocket | null
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    ariaLabel?: string
    onChange?: (json: string) => void
    footerRight?: React.ReactNode
    onProviderReady?: (provider: HocuspocusProvider | null) => void
    /** Height of the skeleton shown while the collaborative chunk loads / before the websocket connects. */
    skeletonHeight?: number
}

export function Editor({ websocketProvider, skeletonHeight = 240, ...props }: EditorProps) {
    const singleUserEditing = useSingleUserEditing()
    // The collaborative editor is a `ssr: false` dynamic import, so the server
    // never renders it. Gate the whole collaborative branch behind a post-mount
    // flag so the server render and the client's FIRST render are byte-identical
    // (both the skeleton); the editor then mounts as a normal client-only update.
    // Without this, the server skeleton vs. the client's dynamic <Suspense>
    // produces a hydration mismatch (the websocket singleton is client-only).
    const [mounted, setMounted] = useState(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration flip
    useEffect(() => setMounted(true), [])

    if (singleUserEditing) {
        return <SingleUserEditor {...props} />
    }

    // Hold the skeleton until we're mounted on the client AND the tab-singleton
    // websocket exists (callers pass null during SSR / pre-hydration).
    if (!mounted || !websocketProvider) return <Skeleton h={skeletonHeight} radius={4} />

    return <CollaborativeEditor websocketProvider={websocketProvider} {...props} />
}
