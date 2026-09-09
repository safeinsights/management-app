'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

// The editor service acknowledges each completed write with the state vector of the snapshot it
// wrote. Hocuspocus snapshots the document before the store callback awaits the database, so an
// edit made during that write is synced but not yet persisted; only the vector distinguishes the
// two (OTTER-726).
export const DOCUMENT_STORED_EVENT = 'document-stored'

// The server debounces a store 2 s after the last keystroke, and a reviewer sitting on a failed
// submission is idle, so a write that is going to happen has happened well inside this window.
export const PERSISTENCE_WAIT_MS = 8_000

type StoredAck = { type?: unknown; documentName?: unknown; stateVector?: unknown }

const decodeVector = (base64: string): Map<number, number> =>
    Y.decodeStateVector(Uint8Array.from(Buffer.from(base64, 'base64')))

/**
 * `awaitFeedbackStored` answers one question: is every edit this tab made contained in a database
 * write that has completed?
 *
 * `true` yes. `false` no, and the editor is known to report writes. `null` cannot tell, because this
 * editor has never acknowledged a write, which in practice means a build that does not send them.
 * Callers must not present `null` as lost work.
 */
export function useDocumentPersistence(provider: HocuspocusProvider | null, documentName: string) {
    const persistedVectorRef = useRef<Map<number, number> | null>(null)
    const hasEverAcknowledgedRef = useRef(false)
    const waitersRef = useRef(new Set<() => void>())

    useEffect(() => {
        if (!provider) return undefined

        const onStateless = ({ payload }: { payload: unknown }) => {
            if (typeof payload !== 'string') return
            let ack: StoredAck
            try {
                ack = JSON.parse(payload) as StoredAck
            } catch {
                return
            }
            if (ack.type !== DOCUMENT_STORED_EVENT) return
            if (ack.documentName !== documentName) return
            if (typeof ack.stateVector !== 'string') return

            try {
                persistedVectorRef.current = decodeVector(ack.stateVector)
            } catch {
                return
            }
            hasEverAcknowledgedRef.current = true
            waitersRef.current.forEach((wake) => wake())
        }

        provider.on('stateless', onStateless)
        return () => {
            provider.off('stateless', onStateless)
        }
    }, [provider, documentName])

    // This tab's own edits are the only ones it can lose, so the comparison is per clientID.
    const isSaved = useCallback(() => {
        if (!provider) return false
        const doc = provider.document
        const live = Y.decodeStateVector(Y.encodeStateVector(doc))
        const mine = live.get(doc.clientID) ?? 0
        if (mine === 0) return true
        return (persistedVectorRef.current?.get(doc.clientID) ?? 0) >= mine
    }, [provider])

    const awaitFeedbackStored = useCallback(
        (timeoutMs: number = PERSISTENCE_WAIT_MS): Promise<boolean | null> => {
            if (!provider) return Promise.resolve(false)
            if (isSaved()) return Promise.resolve(true)

            return new Promise((resolve) => {
                let settled = false
                const finish = (value: boolean | null) => {
                    if (settled) return
                    settled = true
                    waitersRef.current.delete(wake)
                    clearTimeout(timer)
                    resolve(value)
                }
                const wake = () => {
                    if (isSaved()) finish(true)
                }
                const timer = setTimeout(() => finish(hasEverAcknowledgedRef.current ? false : null), timeoutMs)
                waitersRef.current.add(wake)
            })
        },
        [provider, isSaved],
    )

    return { awaitFeedbackStored }
}
