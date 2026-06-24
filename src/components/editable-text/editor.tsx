'use client'

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

    if (singleUserEditing) {
        return <SingleUserEditor {...props} />
    }

    // Collaborative mode needs the tab-singleton websocket; callers pass null
    // until it exists (SSR / pre-hydration), so hold the skeleton until then.
    if (!websocketProvider) return <Skeleton h={skeletonHeight} radius={4} />

    return <CollaborativeEditor websocketProvider={websocketProvider} {...props} />
}
