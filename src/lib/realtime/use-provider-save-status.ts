'use client'

import { useEffect, useRef, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { SaveStatusValue } from '@/components/save-status'

// Stays idle until the user's first local edit, so initial loads and remote-only changes never
// surface an indicator to passive readers.
export function useProviderSaveStatus(provider: HocuspocusProvider | null): SaveStatusValue {
    // Keyed to the provider it was derived from, so a reconnect falls back to idle instead of
    // showing a stale "All changes saved".
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

        // The initial document load also settles unsyncedChanges, which must not read as a save.
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
            // Re-armed so a reconnect's first settle to 0 isn't mistaken for a local save.
            hasLocalEditRef.current = false
        }
    }, [provider])

    return tracked.provider === provider ? tracked.status : 'idle'
}
