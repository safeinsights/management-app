'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

// `seed` and `applyRemote` are held in refs and may be stale closures, so they must read live state
// (a ref, or a Mantine form's getValues) rather than values captured at render.

type Args = {
    provider: HocuspocusProvider | null
    mapName: string
    /** False leaves the hook idle, for a screen whose collaboration is not switched on. */
    enabled?: boolean
    /** Writes local values into the keys the document does not carry. Already inside a transaction. */
    seed: (map: Y.Map<unknown>) => void
    applyRemote: (map: Y.Map<unknown>) => void
    /** False leaves local state alone when a peer writes. Consulted only after the sync. */
    shouldApplyRemote?: () => boolean
}

type Return = {
    map: Y.Map<unknown> | null
    isSynced: boolean
    /** False when there was no map to write to yet, so the caller can hold the value for the sync. */
    transactLocal: (write: (map: Y.Map<unknown>) => void) => boolean
}

export function useYjsMapSync({
    provider,
    mapName,
    enabled = true,
    seed,
    applyRemote,
    shouldApplyRemote,
}: Args): Return {
    const [map, setMap] = useState<Y.Map<unknown> | null>(null)
    const [isSynced, setIsSynced] = useState(false)
    const isApplyingRemote = useRef(false)
    // Per instance: two maps in one document must not share an origin, or one's local write would
    // be ignored by the other's observer.
    const [localOrigin] = useState(() => Symbol('use-yjs-map-sync.local'))

    const seedRef = useRef(seed)
    const applyRemoteRef = useRef(applyRemote)
    const shouldApplyRemoteRef = useRef(shouldApplyRemote)
    useEffect(() => {
        seedRef.current = seed
        applyRemoteRef.current = applyRemote
        shouldApplyRemoteRef.current = shouldApplyRemote
    }, [seed, applyRemote, shouldApplyRemote])

    const runApplyRemote = useCallback((target: Y.Map<unknown>) => {
        isApplyingRemote.current = true
        try {
            applyRemoteRef.current(target)
        } finally {
            isApplyingRemote.current = false
        }
    }, [])

    useEffect(() => {
        if (!enabled || !provider) return undefined

        const doc = provider.document
        const target = doc.getMap<unknown>(mapName)
        let canceled = false
        let hasSynced = false

        const onChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
            // Before the sync the document is still catching up, and onSynced reads it below.
            if (!hasSynced || transaction.origin === localOrigin) return
            if (shouldApplyRemoteRef.current && !shouldApplyRemoteRef.current()) return
            runApplyRemote(target)
        }
        // Observed before onSynced reads the map, not in a later effect: an update landing between
        // the read and the observer was lost until some other peer happened to write again.
        target.observe(onChange)

        const onSynced = () => {
            if (canceled) return
            hasSynced = true
            doc.transact(() => seedRef.current(target), localOrigin)
            runApplyRemote(target)
            setMap(target)
            setIsSynced(true)
        }

        if (provider.isSynced) {
            onSynced()
        } else {
            provider.on('synced', onSynced)
        }

        return () => {
            canceled = true
            target.unobserve(onChange)
            provider.off('synced', onSynced)
            setMap(null)
            setIsSynced(false)
        }
    }, [enabled, provider, mapName, localOrigin, runApplyRemote])

    const transactLocal = useCallback(
        (write: (target: Y.Map<unknown>) => void) => {
            if (!map || isApplyingRemote.current) return false
            map.doc?.transact(() => write(map), localOrigin)
            return true
        },
        [map, localOrigin],
    )

    return useMemo<Return>(() => ({ map, isSynced, transactLocal }), [map, isSynced, transactLocal])
}
