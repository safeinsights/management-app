'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

import { WS_URL } from '@/lib/config'

/**
 * A connection of its own, opened for one stateless broadcast. The decision actions delete the
 * round's document as they commit, so a message sent on the editor's own provider races that
 * teardown. This provider brings its own websocket rather than the shared one, so it cannot take
 * over inbound dispatch for the document name and leave the editor deaf. It never edits: the
 * document it opens stays empty.
 */
export function useBroadcastProvider(docName: string): HocuspocusProvider | null {
    const { getToken } = useAuth()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(null)

    // Through a ref because Clerk hands back a fresh `getToken` identity on most renders. Depending
    // on it directly rebuilt the connection on every render, and each rebuild minted another Y.Doc
    // client id until the process ran out of memory.
    const getTokenRef = useRef(getToken)
    useEffect(() => {
        getTokenRef.current = getToken
    }, [getToken])

    useEffect(() => {
        const doc = new Y.Doc()
        const created = new HocuspocusProvider({
            url: WS_URL,
            name: docName,
            document: doc,
            token: async () => (await getTokenRef.current()) ?? '',
            onAuthenticationFailed: () => {
                console.warn(`broadcast HocuspocusProvider auth failed for ${docName}`)
            },
        } as ConstructorParameters<typeof HocuspocusProvider>[0])

        setProvider(created)
        return () => {
            created.destroy()
            doc.destroy()
            setProvider(null)
        }
    }, [docName])

    return provider
}
