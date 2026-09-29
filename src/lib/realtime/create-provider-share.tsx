'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

type Subscriber = (provider: HocuspocusProvider | null) => void

type ProviderShareState = {
    getProvider: () => HocuspocusProvider | null
    // Identity is stable for the lifetime of the enclosing share, so it is dep-array safe.
    publish: (provider: HocuspocusProvider | null) => void
    subscribe: (notify: Subscriber) => () => void
}

/**
 * Builds the share that carries one round's editor provider from the editor to the listeners beside
 * it. One share per Yjs document name, because HocuspocusProviderWebsocket dispatches inbound
 * messages by document name and a second provider under the same name makes the first go deaf.
 *
 * `hint` completes the "<label> missing: ..." message thrown outside a share.
 */
export function createProviderShare(label: string, hint: string) {
    // Sentinel `null` rather than a no-op default, so the hooks below throw outside a share instead
    // of silently never delivering the provider.
    const ShareContext = createContext<ProviderShareState | null>(null)

    const Share: FC<{ children: ReactNode }> = ({ children }) => {
        const [state] = useState<ProviderShareState>(() => {
            let current: HocuspocusProvider | null = null
            const subscribers = new Set<Subscriber>()
            return {
                getProvider: () => current,
                publish: (provider) => {
                    current = provider
                    subscribers.forEach((notify) => notify(provider))
                },
                subscribe: (notify) => {
                    subscribers.add(notify)
                    // The editor publishes from a child effect, and React runs those before the
                    // parent effect that subscribes here, so a late subscriber has to be handed what
                    // it missed or it waits for an edge that has already passed.
                    notify(current)
                    return () => {
                        subscribers.delete(notify)
                    }
                },
            }
        })

        return <ShareContext.Provider value={state}>{children}</ShareContext.Provider>
    }
    Share.displayName = label

    const useShare = (): ProviderShareState => {
        const ctx = useContext(ShareContext)
        if (!ctx) throw new Error(`${label} missing: ${hint}`)
        return ctx
    }

    // For `CollaborativeEditor`'s `onProviderReady` prop: called with the provider on creation and
    // null on teardown, and subscribers receive both edges.
    const usePublish = (): ((provider: HocuspocusProvider | null) => void) => useShare().publish

    const useProvider = (): HocuspocusProvider | null => {
        const { getProvider, subscribe } = useShare()
        const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
        useEffect(() => subscribe(setProvider), [subscribe])
        return provider
    }

    return { Share, usePublish, useProvider }
}
