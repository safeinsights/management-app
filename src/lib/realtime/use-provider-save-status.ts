'use client'

import { useEffect, useRef, useState } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { SaveStatusValue } from '@/components/save-status'

// Collapses a Hocuspocus provider's local sync lifecycle into the coarse
// idle/saving/saved status the autosave UI shows. Status stays idle until the
// user's first local edit so initial loads and remote-only changes from other
// collaborators don't surface an indicator to passive readers.
export function useProviderSaveStatus(provider: HocuspocusProvider | null): SaveStatusValue {
    const [status, setStatus] = useState<SaveStatusValue>('idle')
    const hasLocalEditRef = useRef(false)

    useEffect(() => {
        if (!provider) return undefined

        const onUnsyncedChanges = () => {
            if (provider.unsyncedChanges > 0) {
                hasLocalEditRef.current = true
                setStatus('saving')
            } else if (hasLocalEditRef.current) {
                setStatus('saved')
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
        }
    }, [provider])

    return status
}
