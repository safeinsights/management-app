'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

// HocuspocusProviderWebsocket dispatches inbound messages by document name, so a second provider
// attaching under the same name overwrites the first and the first goes deaf.

type Subscriber = (provider: HocuspocusProvider | null) => void

type ReviewFeedbackProviderShareState = {
    getProvider: () => HocuspocusProvider | null
    // Identity is stable for the lifetime of the enclosing share, so it is dep-array safe.
    publish: (provider: HocuspocusProvider | null) => void
    subscribe: (notify: Subscriber) => () => void
}

// Sentinel `null` rather than a no-op default, so the hooks below throw outside a share instead
// of silently never delivering kick-out.
const ReviewFeedbackProviderShareContext = createContext<ReviewFeedbackProviderShareState | null>(null)

export const ReviewFeedbackProviderShare: FC<{ children: ReactNode }> = ({ children }) => {
    const [state] = useState<ReviewFeedbackProviderShareState>(() => {
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
                return () => {
                    subscribers.delete(notify)
                }
            },
        }
    })

    return (
        <ReviewFeedbackProviderShareContext.Provider value={state}>
            {children}
        </ReviewFeedbackProviderShareContext.Provider>
    )
}

function useReviewFeedbackProviderShareContext(): ReviewFeedbackProviderShareState {
    const ctx = useContext(ReviewFeedbackProviderShareContext)
    if (!ctx) {
        throw new Error(
            'ReviewFeedbackProviderShare missing: wrap the review page tree in <ReviewFeedbackProviderShare> ' +
                'before using the editor/listener hooks. Without it the listener never receives the editor ' +
                "provider and kick-out won't fire.",
        )
    }
    return ctx
}

// For `CollaborativeEditor`'s `onProviderReady` prop: called with the provider on creation and
// null on teardown, and subscribers receive both edges.
export function usePublishReviewFeedbackProvider(): (provider: HocuspocusProvider | null) => void {
    return useReviewFeedbackProviderShareContext().publish
}

export function useReviewFeedbackProvider(): HocuspocusProvider | null {
    const { getProvider, subscribe } = useReviewFeedbackProviderShareContext()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
    useEffect(() => subscribe(setProvider), [subscribe])
    return provider
}
