'use client'

import { useEffect, useRef, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { SaveStatusValue } from '@/components/save-status'

// Collapses a Hocuspocus provider's local sync lifecycle into the coarse
// idle/saving/saved status the autosave UI shows. Status stays idle until the
// user's first local edit so initial loads and remote-only changes from other
// collaborators don't surface an indicator to passive readers.
export function useProviderSaveStatus(provider: HocuspocusProvider | null): SaveStatusValue {
    // Status is keyed to the provider it was derived from. The effect re-subscribes
    // whenever the provider identity changes (e.g. a websocket reconnect swaps in a
    // fresh HocuspocusProvider); keying the status to the provider lets the indicator
    // fall back to idle on reconnect instead of showing a stale "All changes saved"
    // until the user edits again.
    const [tracked, setTracked] = useState<{ provider: HocuspocusProvider | null; status: SaveStatusValue }>({
        provider: null,
        status: 'idle',
    })
    const hasLocalEditRef = useRef(false)

    useEffect(() => {
        if (!provider) return undefined

        const onUnsyncedChanges = () => {
            if (provider.unsyncedChanges > 0) {
                hasLocalEditRef.current = true
                setTracked({ provider, status: 'saving' })
            } else if (hasLocalEditRef.current) {
                setTracked({ provider, status: 'saved' })
            }
        }

        const startTracking = () => provider.on('unsyncedChanges', onUnsyncedChanges)

        // The initial document load also settles unsyncedChanges; wait for the first
        // sync so that settle isn't mistaken for a save.
        const onSynced = () => {
            provider.off('synced', onSynced)
            startTracking()
        }

        if (provider.isSynced) {
            startTracking()
        } else {
            provider.on('synced', onSynced)
        }

        return () => {
            provider.off('synced', onSynced)
            provider.off('unsyncedChanges', onUnsyncedChanges)
            // Re-arm the latch for the next provider so a reconnect's first settle to
            // unsyncedChanges === 0 isn't mistaken for a local save.
            hasLocalEditRef.current = false
        }
    }, [provider])

    return tracked.provider === provider ? tracked.status : 'idle'
}
