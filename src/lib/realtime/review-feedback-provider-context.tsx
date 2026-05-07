'use client'

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'

// HocuspocusProviderWebsocket dispatches inbound messages by document name via
// `providerMap.set(name, provider)` / `.get(name)`. If two HocuspocusProvider
// instances attach to the same shared websocket with the same name, the second
// `attach()` overwrites the first in the map and the first goes deaf.
//
// On the review page the editor and the submission listener both wanted a
// HocuspocusProvider for `review-feedback-${studyId}`. To avoid the collision,
// the editor publishes its provider here and the listener subscribes to it
// rather than constructing a second provider for the same name.

type Subscriber = (provider: HocuspocusProvider | null) => void

type ReviewFeedbackProviderShareState = {
    /** Latest published HocuspocusProvider for `review-feedback-${studyId}`, or null before the editor has mounted / after teardown. */
    getProvider: () => HocuspocusProvider | null
    /**
     * Editor-side: publish (or clear) the provider for siblings to consume.
     * Identity is stable for the lifetime of the enclosing
     * `ReviewFeedbackProviderShare`, so callers can safely include it in
     * `useEffect`/`useCallback` dep arrays without thrashing.
     */
    publish: (provider: HocuspocusProvider | null) => void
    /** Listener-side: receive updates whenever publish() is called. */
    subscribe: (notify: Subscriber) => () => void
}

// Sentinel `null` default rather than a no-op object. The hooks below throw if
// they're called outside a `ReviewFeedbackProviderShare`, so we fail loudly
// instead of silently never delivering kick-out (the original Bug 1 failure
// mode, just relocated).
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

/**
 * Editor-side hook: returns a `publish` function suitable for passing to
 * `CollaborativeEditor`'s `onProviderReady` prop. The editor calls it with the
 * provider on creation and with null on teardown; subscribers (the listener)
 * receive both edges. Identity is stable for the lifetime of the enclosing
 * `ReviewFeedbackProviderShare`.
 */
export function usePublishReviewFeedbackProvider(): (provider: HocuspocusProvider | null) => void {
    return useReviewFeedbackProviderShareContext().publish
}

/** Listener-side hook: returns the editor's provider, updating on publish/clear. */
export function useReviewFeedbackProvider(): HocuspocusProvider | null {
    const { getProvider, subscribe } = useReviewFeedbackProviderShareContext()
    const [provider, setProvider] = useState<HocuspocusProvider | null>(() => getProvider())
    useEffect(() => subscribe(setProvider), [subscribe])
    return provider
}
