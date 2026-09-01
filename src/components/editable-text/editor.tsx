'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@mantine/core'
import type { HocuspocusProviderWebsocket, HocuspocusProvider } from '@hocuspocus/provider'

import { useSingleUserEditing } from '@/lib/realtime/yjs-websocket-context'
import { SingleUserEditor } from './single-user-editor'
import { resolveContentHeight } from './editor-surface'

const CollaborativeEditor = dynamic(() => import('./collaborative-editor').then((mod) => mod.CollaborativeEditor), {
    ssr: false,
})

// Collaboration-only props are accepted for call-site parity and ignored in single-user mode.
export type EditorProps = {
    /** Globally unique Yjs document name. NOT a DOM id; pass `inputId` for that. */
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
    /** The field's error message goes here, taking the slot the save indicator vacates (OTTER-674). */
    footerLeft?: React.ReactNode
    footerRight?: React.ReactNode
    /** DOM id of the editable surface. Must differ from `id`, which is the Yjs document name. */
    inputId?: string
    /** `string` not `ReactNode`, so a falsy node cannot read as "no error". */
    error?: string | null
    ariaDescribedBy?: string
    /** The label asterisk is visual only, so without this the requirement never reaches AT (OTTER-647). */
    ariaRequired?: boolean
    /** Fires only when focus leaves the whole editor, toolbar included (OTTER-647). */
    onBlur?: () => void
    contentHeight?: number
    isResizable?: boolean
    onProviderReady?: (provider: HocuspocusProvider | null) => void
    /** Defaults to the height the editor mounts at, so the swap is not a jump. */
    skeletonHeight?: number
}

export function Editor({ websocketProvider, skeletonHeight, ...props }: EditorProps) {
    const singleUserEditing = useSingleUserEditing()
    // Keeps the server render and the client's first render byte-identical; without it the
    // dynamic <Suspense> is a hydration mismatch.
    const [mounted, setMounted] = useState(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration flip
    useEffect(() => setMounted(true), [])

    // Sized like the editor it stands in for; this outer skeleton renders first, so a flat
    // default here is the jump the user sees.
    const placeholderHeight = skeletonHeight ?? resolveContentHeight(props.contentHeight, props.contentStyle)

    if (singleUserEditing) {
        return <SingleUserEditor {...props} />
    }

    // Callers pass a null websocket during SSR and pre-hydration.
    if (!mounted || !websocketProvider) return <Skeleton h={placeholderHeight} radius={4} />

    return <CollaborativeEditor websocketProvider={websocketProvider} {...props} />
}
